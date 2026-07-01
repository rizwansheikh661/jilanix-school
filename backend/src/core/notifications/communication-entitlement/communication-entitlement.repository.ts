/**
 * CommunicationEntitlementRepository — persistence for the
 * `school_communication_entitlements` singleton row (one per school).
 *
 * Mirrors `FeeHeadRepository` shape:
 *   - tenant-aware methods derive `schoolId` from the supplied parameter so
 *     the same repo serves super-admin paths (cross-school) without leaning
 *     on `RequestContextRegistry`.
 *   - composite-PK lookups use `where: { schoolId_id: { schoolId, id } }`.
 *   - optimistic concurrency via `version` — `update`/`resetUsage` bump it;
 *     `incrementUsage` deliberately does NOT (internal counter mutation).
 *
 * The model is TENANT_OWNED, so cross-school admin reads/writes set
 * `__schoolosCtx.bypassTenantScope` on the args bag.
 */
import { Injectable } from '@nestjs/common';

import { VersionConflict } from '../../errors/domain-error';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { SchoolCommunicationEntitlementRow } from '../notifications.types';

export interface CreateEntitlementInput {
  readonly schoolId: string;
  readonly emailEnabled?: boolean;
  readonly smsEnabled?: boolean;
  readonly whatsappEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly emailMonthlyLimit?: number | null;
  readonly smsMonthlyLimit?: number | null;
  readonly whatsappMonthlyLimit?: number | null;
  readonly usagePeriodStart: Date;
  readonly usagePeriodEnd: Date;
  readonly isTrial?: boolean;
  readonly trialExpiresAt?: Date | null;
  readonly createdBy?: string | null;
}

export interface UpdateEntitlementInput {
  readonly emailEnabled?: boolean;
  readonly smsEnabled?: boolean;
  readonly whatsappEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly emailMonthlyLimit?: number | null;
  readonly smsMonthlyLimit?: number | null;
  readonly whatsappMonthlyLimit?: number | null;
  readonly isTrial?: boolean;
  readonly trialExpiresAt?: Date | null;
  readonly updatedBy?: string | null;
}

export interface ListEntitlementsFilters {
  readonly cursor?: string;
  readonly limit?: number;
}

const ENTITLEMENT_CHANNEL_COLUMN: Readonly<
  Record<'EMAIL' | 'SMS' | 'WHATSAPP', 'emailUsedThisPeriod' | 'smsUsedThisPeriod' | 'whatsappUsedThisPeriod'>
> = Object.freeze({
  EMAIL: 'emailUsedThisPeriod',
  SMS: 'smsUsedThisPeriod',
  WHATSAPP: 'whatsappUsedThisPeriod',
});

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin cross-school read' }),
  }),
});

@Injectable()
export class CommunicationEntitlementRepository {
  public async findBySchool(
    tx: PrismaTx,
    schoolId: string,
  ): Promise<SchoolCommunicationEntitlementRow | null> {
    return tx.schoolCommunicationEntitlement.findUnique({
      where: { schoolId },
    });
  }

  public async create(
    tx: PrismaTx,
    data: CreateEntitlementInput,
  ): Promise<SchoolCommunicationEntitlementRow> {
    return tx.schoolCommunicationEntitlement.create({
      data: {
        schoolId: data.schoolId,
        ...(data.emailEnabled !== undefined ? { emailEnabled: data.emailEnabled } : {}),
        ...(data.smsEnabled !== undefined ? { smsEnabled: data.smsEnabled } : {}),
        ...(data.whatsappEnabled !== undefined ? { whatsappEnabled: data.whatsappEnabled } : {}),
        ...(data.inAppEnabled !== undefined ? { inAppEnabled: data.inAppEnabled } : {}),
        emailMonthlyLimit: data.emailMonthlyLimit ?? null,
        smsMonthlyLimit: data.smsMonthlyLimit ?? null,
        whatsappMonthlyLimit: data.whatsappMonthlyLimit ?? null,
        usagePeriodStart: data.usagePeriodStart,
        usagePeriodEnd: data.usagePeriodEnd,
        ...(data.isTrial !== undefined ? { isTrial: data.isTrial } : {}),
        trialExpiresAt: data.trialExpiresAt ?? null,
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      },
    });
  }

  public async update(
    tx: PrismaTx,
    schoolId: string,
    id: string,
    expectedVersion: number,
    data: UpdateEntitlementInput,
  ): Promise<SchoolCommunicationEntitlementRow> {
    const patch: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: data.updatedBy ?? null,
    };
    if (data.emailEnabled !== undefined) patch.emailEnabled = data.emailEnabled;
    if (data.smsEnabled !== undefined) patch.smsEnabled = data.smsEnabled;
    if (data.whatsappEnabled !== undefined) patch.whatsappEnabled = data.whatsappEnabled;
    if (data.inAppEnabled !== undefined) patch.inAppEnabled = data.inAppEnabled;
    if (data.emailMonthlyLimit !== undefined) patch.emailMonthlyLimit = data.emailMonthlyLimit;
    if (data.smsMonthlyLimit !== undefined) patch.smsMonthlyLimit = data.smsMonthlyLimit;
    if (data.whatsappMonthlyLimit !== undefined) patch.whatsappMonthlyLimit = data.whatsappMonthlyLimit;
    if (data.isTrial !== undefined) patch.isTrial = data.isTrial;
    if (data.trialExpiresAt !== undefined) patch.trialExpiresAt = data.trialExpiresAt;

    const result = await tx.schoolCommunicationEntitlement.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: patch,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflict('SchoolCommunicationEntitlement', id, expectedVersion);
    }
    const reloaded = await tx.schoolCommunicationEntitlement.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflict('SchoolCommunicationEntitlement', id, expectedVersion);
    }
    return reloaded;
  }

  public async incrementUsage(
    tx: PrismaTx,
    schoolId: string,
    id: string,
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
    by = 1,
  ): Promise<SchoolCommunicationEntitlementRow> {
    const column = ENTITLEMENT_CHANNEL_COLUMN[channel];
    return tx.schoolCommunicationEntitlement.update({
      where: { schoolId_id: { schoolId, id } },
      data: { [column]: { increment: by } } as Record<string, unknown>,
    });
  }

  public async resetUsage(
    tx: PrismaTx,
    schoolId: string,
    id: string,
    expectedVersion: number,
    newPeriodStart: Date,
    newPeriodEnd: Date,
  ): Promise<SchoolCommunicationEntitlementRow> {
    const result = await tx.schoolCommunicationEntitlement.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: {
        emailUsedThisPeriod: 0,
        smsUsedThisPeriod: 0,
        whatsappUsedThisPeriod: 0,
        usagePeriodStart: newPeriodStart,
        usagePeriodEnd: newPeriodEnd,
        version: { increment: 1 },
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflict('SchoolCommunicationEntitlement', id, expectedVersion);
    }
    const reloaded = await tx.schoolCommunicationEntitlement.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflict('SchoolCommunicationEntitlement', id, expectedVersion);
    }
    return reloaded;
  }

  public async list(
    tx: PrismaTx,
    filters: ListEntitlementsFilters,
  ): Promise<{
    readonly items: readonly SchoolCommunicationEntitlementRow[];
    readonly nextCursor: string | null;
  }> {
    const limit = filters.limit ?? 50;
    const rows = await tx.schoolCommunicationEntitlement.findMany({
      orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(filters.cursor !== undefined
        ? { cursor: { schoolId_id: parseCursor(filters.cursor) }, skip: 1 }
        : {}),
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const overflow = rows.length > limit ? rows.pop() : undefined;
    const nextCursor = overflow !== undefined ? formatCursor(overflow.schoolId, overflow.id) : null;
    return { items: rows, nextCursor };
  }

  public async findByIdForAdmin(
    tx: PrismaTx,
    schoolId: string,
  ): Promise<SchoolCommunicationEntitlementRow | null> {
    return tx.schoolCommunicationEntitlement.findUnique({
      where: { schoolId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
  }
}

export type EntitlementChannel = keyof typeof ENTITLEMENT_CHANNEL_COLUMN;

function formatCursor(schoolId: string, id: string): string {
  return Buffer.from(`${schoolId}:${id}`, 'utf8').toString('base64url');
}

function parseCursor(cursor: string): { schoolId: string; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const [schoolId, id] = decoded.split(':');
  if (schoolId === undefined || id === undefined) {
    return { schoolId: '', id: '' };
  }
  return { schoolId, id };
}
