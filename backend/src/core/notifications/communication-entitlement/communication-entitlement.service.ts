/**
 * CommunicationEntitlementService — singleton per-school comms quota engine.
 *
 * Two surfaces:
 *   - Tenant-scoped: lazy-create + read the current school's entitlement and
 *     usage snapshot.
 *   - Super-admin: list/read/update/reset entitlements across schools.
 *
 * Plus the quota engine `assertAndIncrement(tx, schoolId, channel)` consumed
 * by the dispatcher (Wave 9): rolls a stale period, validates the channel
 * flag, increments the counter, and throws on quota exhaustion.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { DomainError, ForbiddenError, NotFoundError } from '../../errors/domain-error';
import { ERROR_CODES } from '../../../contracts/api';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  NotificationsFeatureFlags,
  NotificationsOutboxTopics,
  type NotificationChannelValue,
} from '../notifications.constants';
import {
  CommunicationChannelDisabledError,
  CommunicationQuotaExceededError,
} from '../notifications.errors';
import type { SchoolCommunicationEntitlementRow } from '../notifications.types';
import {
  CommunicationEntitlementRepository,
  type ListEntitlementsFilters,
  type UpdateEntitlementInput,
} from './communication-entitlement.repository';

export interface UpdateEntitlementArgs {
  readonly emailEnabled?: boolean;
  readonly smsEnabled?: boolean;
  readonly whatsappEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly emailMonthlyLimit?: number | null;
  readonly smsMonthlyLimit?: number | null;
  readonly whatsappMonthlyLimit?: number | null;
  readonly isTrial?: boolean;
  readonly trialExpiresAt?: Date | null;
}

export interface EntitlementUsageSnapshot {
  readonly schoolId: string;
  readonly period: { readonly start: Date; readonly end: Date };
  readonly email: { readonly used: number; readonly limit: number | null };
  readonly sms: { readonly used: number; readonly limit: number | null };
  readonly whatsapp: { readonly used: number; readonly limit: number | null };
}

class NotificationsModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Notifications module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: NotificationsFeatureFlags.MODULE },
    });
  }
}

@Injectable()
export class CommunicationEntitlementService {
  private readonly logger = new Logger(CommunicationEntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: CommunicationEntitlementRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Tenant-scoped surface
  // -------------------------------------------------------------------------

  public async getOrCreateForCurrentSchool(): Promise<SchoolCommunicationEntitlementRow> {
    const ctx = RequestContextRegistry.require();
    await this.assertModuleEnabled(ctx.schoolId ?? null);
    if (ctx.schoolId === undefined) {
      throw new ForbiddenError('Tenant scope required.');
    }
    const schoolId = ctx.schoolId;
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      return this.loadOrCreate(tx, schoolId, ctx.userId ?? null);
    });
  }

  public async getUsageSnapshot(): Promise<EntitlementUsageSnapshot> {
    const row = await this.getOrCreateForCurrentSchool();
    return toUsageSnapshot(row);
  }

  // -------------------------------------------------------------------------
  // Super-admin surface
  // -------------------------------------------------------------------------

  public async listAll(filters: ListEntitlementsFilters): Promise<{
    readonly items: readonly SchoolCommunicationEntitlementRow[];
    readonly nextCursor: string | null;
  }> {
    this.assertPlatformActor();
    const tx = this.prisma.client as unknown as PrismaTx;
    return this.repository.list(tx, filters);
  }

  public async getOne(schoolId: string): Promise<SchoolCommunicationEntitlementRow> {
    this.assertPlatformActor();
    const tx = this.prisma.client as unknown as PrismaTx;
    const row = await this.repository.findByIdForAdmin(tx, schoolId);
    if (row === null) {
      throw new NotFoundError('SchoolCommunicationEntitlement', schoolId);
    }
    return row;
  }

  public async update(
    schoolId: string,
    expectedVersion: number,
    input: UpdateEntitlementArgs,
  ): Promise<SchoolCommunicationEntitlementRow> {
    this.assertPlatformActor();
    const ctx = RequestContextRegistry.require();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repository.findByIdForAdmin(tx, schoolId);
      if (current === null) {
        throw new NotFoundError('SchoolCommunicationEntitlement', schoolId);
      }
      const patch: UpdateEntitlementInput = {
        ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
        ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
        ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
        ...(input.inAppEnabled !== undefined ? { inAppEnabled: input.inAppEnabled } : {}),
        ...(input.emailMonthlyLimit !== undefined
          ? { emailMonthlyLimit: input.emailMonthlyLimit }
          : {}),
        ...(input.smsMonthlyLimit !== undefined
          ? { smsMonthlyLimit: input.smsMonthlyLimit }
          : {}),
        ...(input.whatsappMonthlyLimit !== undefined
          ? { whatsappMonthlyLimit: input.whatsappMonthlyLimit }
          : {}),
        ...(input.isTrial !== undefined ? { isTrial: input.isTrial } : {}),
        ...(input.trialExpiresAt !== undefined ? { trialExpiresAt: input.trialExpiresAt } : {}),
        updatedBy: ctx.userId ?? null,
      };
      const updated = await this.repository.update(
        tx,
        schoolId,
        current.id,
        expectedVersion,
        patch,
      );
      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.ENTITLEMENT_UPDATED,
        eventType: 'CommunicationEntitlementUpdated',
        aggregateType: 'SchoolCommunicationEntitlement',
        aggregateId: updated.id,
        schoolId,
        payload: {
          id: updated.id,
          schoolId,
          emailEnabled: updated.emailEnabled,
          smsEnabled: updated.smsEnabled,
          whatsappEnabled: updated.whatsappEnabled,
          inAppEnabled: updated.inAppEnabled,
          emailMonthlyLimit: updated.emailMonthlyLimit,
          smsMonthlyLimit: updated.smsMonthlyLimit,
          whatsappMonthlyLimit: updated.whatsappMonthlyLimit,
          isTrial: updated.isTrial,
        },
      });
      await this.audit.record(
        {
          action: 'communication_entitlement.update',
          category: 'general',
          resourceType: 'SchoolCommunicationEntitlement',
          resourceId: updated.id,
          schoolId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async resetUsage(
    schoolId: string,
    expectedVersion: number,
  ): Promise<SchoolCommunicationEntitlementRow> {
    this.assertPlatformActor();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repository.findByIdForAdmin(tx, schoolId);
      if (current === null) {
        throw new NotFoundError('SchoolCommunicationEntitlement', schoolId);
      }
      const now = new Date();
      const updated = await this.repository.resetUsage(
        tx,
        schoolId,
        current.id,
        expectedVersion,
        startOfMonth(now),
        startOfNextMonth(now),
      );
      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.ENTITLEMENT_UPDATED,
        eventType: 'CommunicationEntitlementUsageReset',
        aggregateType: 'SchoolCommunicationEntitlement',
        aggregateId: updated.id,
        schoolId,
        payload: {
          id: updated.id,
          schoolId,
          periodStart: updated.usagePeriodStart.toISOString(),
          periodEnd: updated.usagePeriodEnd.toISOString(),
          reason: 'OPERATOR_RESET',
        },
      });
      await this.audit.record(
        {
          action: 'communication_entitlement.reset_usage',
          category: 'general',
          resourceType: 'SchoolCommunicationEntitlement',
          resourceId: updated.id,
          schoolId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async getCrossSchoolUsage(period?: string): Promise<{
    readonly items: readonly EntitlementUsageSnapshot[];
    readonly nextCursor: string | null;
  }> {
    this.assertPlatformActor();
    const tx = this.prisma.client as unknown as PrismaTx;
    const page = await this.repository.list(tx, { limit: 200 });
    const items = page.items
      .filter((row) => {
        if (period === undefined) return true;
        return formatPeriodMonth(row.usagePeriodStart) === period;
      })
      .map(toUsageSnapshot);
    return { items, nextCursor: page.nextCursor };
  }

  // -------------------------------------------------------------------------
  // Quota engine — used by dispatcher (Wave 9+)
  // -------------------------------------------------------------------------

  /**
   * Validate channel + quota and atomically increment the per-period counter.
   * Throws `CommunicationChannelDisabledError` if the channel flag is off and
   * `CommunicationQuotaExceededError` if the monthly limit has been reached.
   * Caller MUST NOT invoke this for IN_APP (it bypasses entitlements).
   */
  public async assertAndIncrement(
    tx: PrismaTx,
    schoolId: string,
    channel: NotificationChannelValue,
  ): Promise<SchoolCommunicationEntitlementRow> {
    if (channel === 'IN_APP' || channel === 'PUSH') {
      // PUSH (Sprint 17) has no provider yet — bypass entitlements until a
      // real adapter ships. IN_APP is structurally free for the same reason.
      throw new Error(
        `assertAndIncrement must not be called for ${channel} channel.`,
      );
    }
    const channelEnum: 'EMAIL' | 'SMS' | 'WHATSAPP' = channel;
    const current = await this.loadOrCreate(tx, schoolId, null);
    const rolled = await this._rollPeriodIfStale(tx, schoolId, current);

    if (!isChannelEnabled(rolled, channelEnum)) {
      throw new CommunicationChannelDisabledError({
        channel,
        reason: 'ENTITLEMENT_CHANNEL_DISABLED',
      });
    }

    const updated = await this.repository.incrementUsage(tx, schoolId, rolled.id, channelEnum);
    const limit = limitFor(updated, channelEnum);
    const used = usedFor(updated, channelEnum);
    if (limit !== null && used > limit) {
      // TODO Sprint 10.1 — outbox publish happens inside the same tx that
      // will roll back on throw; the quota-exhausted event is therefore
      // best-effort and may be lost. Move to a dispatcher-side hook that
      // publishes in its own short tx once the queue handler lands.
      await this.outbox.publish(tx, {
        topic: NotificationsOutboxTopics.QUOTA_EXHAUSTED,
        eventType: 'CommunicationQuotaExhausted',
        aggregateType: 'SchoolCommunicationEntitlement',
        aggregateId: updated.id,
        schoolId,
        payload: { id: updated.id, schoolId, channel, limit, used },
      });
      throw new CommunicationQuotaExceededError({ channel, limit, used });
    }
    return updated;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadOrCreate(
    tx: PrismaTx,
    schoolId: string,
    actorUserId: string | null,
  ): Promise<SchoolCommunicationEntitlementRow> {
    const existing = await this.repository.findBySchool(tx, schoolId);
    if (existing !== null) return existing;
    const now = new Date();
    const created = await this.repository.create(tx, {
      schoolId,
      emailEnabled: true,
      smsEnabled: false,
      whatsappEnabled: false,
      inAppEnabled: true,
      emailMonthlyLimit: null,
      smsMonthlyLimit: null,
      whatsappMonthlyLimit: null,
      usagePeriodStart: startOfMonth(now),
      usagePeriodEnd: startOfNextMonth(now),
      isTrial: false,
      trialExpiresAt: null,
      createdBy: actorUserId,
    });
    this.logger.log(
      `SchoolCommunicationEntitlement created schoolId=${schoolId} id=${created.id}.`,
    );
    return created;
  }

  private async _rollPeriodIfStale(
    tx: PrismaTx,
    schoolId: string,
    row: SchoolCommunicationEntitlementRow,
  ): Promise<SchoolCommunicationEntitlementRow> {
    const now = new Date();
    if (now <= row.usagePeriodEnd) return row;
    return this.repository.resetUsage(
      tx,
      schoolId,
      row.id,
      row.version,
      startOfMonth(now),
      startOfNextMonth(now),
    );
  }

  private async assertModuleEnabled(schoolId: string | null): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId },
    );
    if (!enabled) throw new NotificationsModuleDisabledError();
  }

  private assertPlatformActor(): void {
    const ctx = RequestContextRegistry.require();
    if (ctx.actorScope !== 'global') {
      throw new ForbiddenError('Super-admin scope required for this operation.', {
        reason: 'PLATFORM_SCOPE_REQUIRED',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function isChannelEnabled(
  row: SchoolCommunicationEntitlementRow,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
): boolean {
  switch (channel) {
    case 'EMAIL':
      return row.emailEnabled;
    case 'SMS':
      return row.smsEnabled;
    case 'WHATSAPP':
      return row.whatsappEnabled;
  }
}

function limitFor(
  row: SchoolCommunicationEntitlementRow,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
): number | null {
  switch (channel) {
    case 'EMAIL':
      return row.emailMonthlyLimit;
    case 'SMS':
      return row.smsMonthlyLimit;
    case 'WHATSAPP':
      return row.whatsappMonthlyLimit;
  }
}

function usedFor(
  row: SchoolCommunicationEntitlementRow,
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
): number {
  switch (channel) {
    case 'EMAIL':
      return row.emailUsedThisPeriod;
    case 'SMS':
      return row.smsUsedThisPeriod;
    case 'WHATSAPP':
      return row.whatsappUsedThisPeriod;
  }
}

function toUsageSnapshot(row: SchoolCommunicationEntitlementRow): EntitlementUsageSnapshot {
  return {
    schoolId: row.schoolId,
    period: { start: row.usagePeriodStart, end: row.usagePeriodEnd },
    email: { used: row.emailUsedThisPeriod, limit: row.emailMonthlyLimit },
    sms: { used: row.smsUsedThisPeriod, limit: row.smsMonthlyLimit },
    whatsapp: { used: row.whatsappUsedThisPeriod, limit: row.whatsappMonthlyLimit },
  };
}

function formatPeriodMonth(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}
