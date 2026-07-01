/**
 * SubscriptionService — 9-method lifecycle orchestrator for the per-school
 * Subscription row.
 *
 * Methods (all transactional):
 *   - assignInitialSubscription : called from school provisioning. Seeds a
 *                                 TRIAL or PENDING row for the brand-new
 *                                 school using the Plan's pricing snapshot.
 *   - assign                    : super-admin assigns / re-assigns a plan.
 *                                 Soft-cancels the previous active row.
 *   - activate                  : PENDING|TRIAL|EXPIRED|SUSPENDED -> ACTIVE.
 *   - upgrade / downgrade       : close current ACTIVE -> open new ACTIVE on
 *                                 the new plan. Records UPGRADED / DOWNGRADED
 *                                 history rows on the *new* row.
 *   - renew                     : extends the expiry date and bumps
 *                                 lastRenewedAt / nextRenewalAt. Status moves
 *                                 EXPIRING -> ACTIVE if applicable.
 *   - suspend                   : ACTIVE|EXPIRING|TRIAL -> SUSPENDED.
 *   - reactivate                : SUSPENDED -> ACTIVE.
 *   - cancel                    : any non-terminal -> CANCELLED (terminal).
 *
 * Each mutation:
 *   1) loads the current row (or throws SubscriptionNotFoundError),
 *   2) asserts the transition via the pure state machine,
 *   3) writes the new row (optimistic-concurrency via `version`),
 *   4) appends a SubscriptionHistory row,
 *   5) publishes an outbox event + writes a `tenancy` audit row.
 *
 * Pricing snapshot: the Subscription row captures the Plan's monthlyPrice /
 * yearlyPrice / currency at assignment time so price-grid edits later don't
 * silently retroactively change a tenant's contract.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { SubscriptionOutboxTopics } from '../subscription.constants';
import {
  SubscriptionAlreadyCancelledError,
  SubscriptionNotFoundError,
} from '../subscription.errors';
import type {
  BillingCycleValue,
  SubscriptionActionValue,
  SubscriptionRow,
  SubscriptionStatusValue,
} from '../subscription.types';
import {
  SubscriptionRepository,
  type CreateSubscriptionInput,
} from './subscription.repository';
import { SubscriptionHistoryRepository } from './subscription-history.repository';
import { assertSubscriptionTransition, isTerminal } from './subscription-transitions';

export interface AssignSubscriptionArgs {
  readonly schoolId: string;
  readonly planId: string;
  readonly billingCycle: BillingCycleValue;
  readonly trialDays?: number | null;
  readonly autoRenew?: boolean;
}

export interface ChangePlanArgs {
  readonly schoolId: string;
  readonly subscriptionId: string;
  readonly expectedVersion: number;
  readonly newPlanId: string;
  readonly billingCycle?: BillingCycleValue;
  readonly reason?: string | null;
}

export interface RenewArgs {
  readonly schoolId: string;
  readonly subscriptionId: string;
  readonly expectedVersion: number;
  readonly extendDays: number;
  readonly billingCycle?: BillingCycleValue;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SubscriptionRepository,
    private readonly history: SubscriptionHistoryRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // reads
  // -------------------------------------------------------------------------

  public async getActive(schoolId: string): Promise<SubscriptionRow> {
    const row = await this.repo.findActiveBySchool(schoolId);
    if (row === null) {
      throw new SubscriptionNotFoundError(schoolId);
    }
    return row;
  }

  public async getActiveOrNull(schoolId: string, tx?: PrismaTx): Promise<SubscriptionRow | null> {
    return this.repo.findActiveBySchool(schoolId, tx);
  }

  public async getById(schoolId: string, id: string): Promise<SubscriptionRow> {
    const row = await this.repo.findById(schoolId, id);
    if (row === null) {
      throw new SubscriptionNotFoundError(id);
    }
    return row;
  }

  public async listForSchool(schoolId: string): Promise<readonly SubscriptionRow[]> {
    return this.repo.listBySchool(schoolId);
  }

  // -------------------------------------------------------------------------
  // assignInitialSubscription — provisioning hook (Wave 9 calls this from
  // SchoolProvisioningService inside the existing provisioning transaction).
  // -------------------------------------------------------------------------

  public async assignInitialSubscription(
    schoolId: string,
    planId: string,
    billingCycle: BillingCycleValue,
    tx: PrismaTx,
  ): Promise<SubscriptionRow> {
    const pricing = await this.readPlanPricing(tx, planId);
    const now = new Date();
    const initialStatus: SubscriptionStatusValue =
      billingCycle === 'TRIAL' ? 'TRIAL' : 'PENDING';
    const trialEndsAt =
      billingCycle === 'TRIAL' && pricing.trialDays > 0
        ? new Date(now.getTime() + pricing.trialDays * MS_PER_DAY)
        : null;
    const expiryDate = trialEndsAt;

    const input: CreateSubscriptionInput = {
      schoolId,
      planId,
      status: initialStatus,
      billingCycle,
      currency: pricing.currency,
      monthlyPrice: pricing.monthlyPrice,
      yearlyPrice: pricing.yearlyPrice,
      assignedAt: now,
      startedAt: initialStatus === 'TRIAL' ? now : null,
      ...(trialEndsAt !== null ? { trialEndsAt } : {}),
      ...(expiryDate !== null ? { expiryDate } : {}),
      autoRenew: false,
    };
    const created = await this.repo.create(input, tx);
    await this.history.record(
      {
        schoolId,
        subscriptionId: created.id,
        action: 'ASSIGNED',
        toPlanId: planId,
        toStatus: created.status,
      },
      tx,
    );
    await this.emitLifecycle(
      tx,
      created,
      null,
      SubscriptionOutboxTopics.SUBSCRIPTION_ASSIGNED,
      'SubscriptionAssigned',
      'subscription.subscription.assigned',
    );
    if (initialStatus === 'TRIAL') {
      await this.emitLifecycle(
        tx,
        created,
        null,
        SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED,
        'SubscriptionActivated',
        'subscription.subscription.activated',
      );
    }
    return created;
  }

  // -------------------------------------------------------------------------
  // assign — super-admin assigns / re-assigns a plan.
  // If the school has a live subscription, the previous row is CANCELLED
  // first (idempotent for the case where there is none). Returns the new
  // PENDING/TRIAL row.
  // -------------------------------------------------------------------------

  public async assign(args: AssignSubscriptionArgs): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findActiveBySchool(args.schoolId, tx);
      if (existing !== null && !isTerminal(existing.status)) {
        await this.cancelInternal(tx, existing, 'plan reassignment');
      }
      return this.assignInitialSubscription(
        args.schoolId,
        args.planId,
        args.billingCycle,
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // activate — PENDING|TRIAL|EXPIRED|SUSPENDED -> ACTIVE.
  // -------------------------------------------------------------------------

  public async activate(
    schoolId: string,
    subscriptionId: string,
    expectedVersion: number,
  ): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, subscriptionId, tx);
      this.assertNotCancelled(current);
      assertSubscriptionTransition(current.status, 'ACTIVE');

      const now = new Date();
      const updated = await this.repo.update(
        schoolId,
        subscriptionId,
        expectedVersion,
        {
          status: 'ACTIVE',
          startedAt: current.startedAt ?? now,
          cancelledAt: null,
        },
        tx,
      );
      await this.history.record(
        {
          schoolId,
          subscriptionId,
          action: 'ACTIVATED',
          fromStatus: current.status,
          toStatus: 'ACTIVE',
        },
        tx,
      );
      await this.emitLifecycle(
        tx,
        updated,
        current,
        SubscriptionOutboxTopics.SUBSCRIPTION_ACTIVATED,
        'SubscriptionActivated',
        'subscription.subscription.activated',
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // upgrade / downgrade — close the existing ACTIVE row, open a new ACTIVE
  // row pinned to the new plan. The new row carries fresh pricing.
  // -------------------------------------------------------------------------

  public async upgrade(args: ChangePlanArgs): Promise<SubscriptionRow> {
    return this.changePlan(args, 'UPGRADED', SubscriptionOutboxTopics.PLAN_UPGRADED, 'PlanUpgraded');
  }

  public async downgrade(args: ChangePlanArgs): Promise<SubscriptionRow> {
    return this.changePlan(
      args,
      'DOWNGRADED',
      SubscriptionOutboxTopics.PLAN_DOWNGRADED,
      'PlanDowngraded',
    );
  }

  private async changePlan(
    args: ChangePlanArgs,
    action: Extract<SubscriptionActionValue, 'UPGRADED' | 'DOWNGRADED'>,
    topic: typeof SubscriptionOutboxTopics[keyof typeof SubscriptionOutboxTopics],
    eventType: string,
  ): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(args.schoolId, args.subscriptionId, tx);
      this.assertNotCancelled(current);
      if (current.planId === args.newPlanId) {
        // No-op plan change; surface a transition error so callers don't
        // silently log a phantom upgrade.
        throw new SubscriptionAlreadyCancelledError(args.subscriptionId);
      }
      // Cancel the current row first.
      await this.repo.update(
        args.schoolId,
        args.subscriptionId,
        args.expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: args.reason ?? `plan ${action.toLowerCase()}`,
        },
        tx,
      );
      // Open the new row on the target plan.
      const pricing = await this.readPlanPricing(tx, args.newPlanId);
      const now = new Date();
      const billingCycle = args.billingCycle ?? current.billingCycle;
      const created = await this.repo.create(
        {
          schoolId: args.schoolId,
          planId: args.newPlanId,
          status: 'ACTIVE',
          billingCycle,
          currency: pricing.currency,
          monthlyPrice: pricing.monthlyPrice,
          yearlyPrice: pricing.yearlyPrice,
          assignedAt: now,
          startedAt: now,
          autoRenew: current.autoRenew,
          ...(current.expiryDate !== null ? { expiryDate: current.expiryDate } : {}),
        },
        tx,
      );
      await this.history.record(
        {
          schoolId: args.schoolId,
          subscriptionId: created.id,
          action,
          fromPlanId: current.planId,
          toPlanId: args.newPlanId,
          fromStatus: current.status,
          toStatus: 'ACTIVE',
          ...(args.reason !== undefined ? { actorReason: args.reason } : {}),
        },
        tx,
      );
      await this.emitLifecycle(tx, created, current, topic, eventType, `subscription.plan.${action.toLowerCase()}`);
      return created;
    });
  }

  // -------------------------------------------------------------------------
  // renew — extend expiryDate by `extendDays`, set lastRenewedAt = now,
  // nextRenewalAt = new expiryDate. EXPIRING reverts to ACTIVE.
  // -------------------------------------------------------------------------

  public async renew(args: RenewArgs): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(args.schoolId, args.subscriptionId, tx);
      this.assertNotCancelled(current);

      const now = new Date();
      const base = current.expiryDate !== null && current.expiryDate > now
        ? current.expiryDate
        : now;
      const newExpiry = new Date(base.getTime() + args.extendDays * MS_PER_DAY);
      const targetStatus: SubscriptionStatusValue =
        current.status === 'EXPIRING' || current.status === 'EXPIRED' ? 'ACTIVE' : current.status;
      if (targetStatus !== current.status) {
        assertSubscriptionTransition(current.status, targetStatus);
      }

      const updated = await this.repo.update(
        args.schoolId,
        args.subscriptionId,
        args.expectedVersion,
        {
          status: targetStatus,
          expiryDate: newExpiry,
          lastRenewedAt: now,
          nextRenewalAt: newExpiry,
          ...(args.billingCycle !== undefined ? { billingCycle: args.billingCycle } : {}),
        },
        tx,
      );
      await this.history.record(
        {
          schoolId: args.schoolId,
          subscriptionId: args.subscriptionId,
          action: 'RENEWED',
          fromStatus: current.status,
          toStatus: updated.status,
          metadataJson: { extendDays: args.extendDays, newExpiry: newExpiry.toISOString() },
        },
        tx,
      );
      await this.emitLifecycle(
        tx,
        updated,
        current,
        SubscriptionOutboxTopics.PLAN_RENEWED,
        'PlanRenewed',
        'subscription.plan.renewed',
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // suspend — ACTIVE|EXPIRING|TRIAL -> SUSPENDED.
  // -------------------------------------------------------------------------

  public async suspend(
    schoolId: string,
    subscriptionId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, subscriptionId, tx);
      this.assertNotCancelled(current);
      assertSubscriptionTransition(current.status, 'SUSPENDED');

      const updated = await this.repo.update(
        schoolId,
        subscriptionId,
        expectedVersion,
        { status: 'SUSPENDED', cancellationReason: reason },
        tx,
      );
      await this.history.record(
        {
          schoolId,
          subscriptionId,
          action: 'SUSPENDED',
          fromStatus: current.status,
          toStatus: 'SUSPENDED',
          actorReason: reason,
        },
        tx,
      );
      await this.emitLifecycle(
        tx,
        updated,
        current,
        SubscriptionOutboxTopics.SUBSCRIPTION_SUSPENDED,
        'SubscriptionSuspended',
        'subscription.subscription.suspended',
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // reactivate — SUSPENDED -> ACTIVE.
  // -------------------------------------------------------------------------

  public async reactivate(
    schoolId: string,
    subscriptionId: string,
    expectedVersion: number,
  ): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, subscriptionId, tx);
      this.assertNotCancelled(current);
      assertSubscriptionTransition(current.status, 'ACTIVE');

      const updated = await this.repo.update(
        schoolId,
        subscriptionId,
        expectedVersion,
        { status: 'ACTIVE', cancellationReason: null },
        tx,
      );
      await this.history.record(
        {
          schoolId,
          subscriptionId,
          action: 'REACTIVATED',
          fromStatus: current.status,
          toStatus: 'ACTIVE',
        },
        tx,
      );
      await this.emitLifecycle(
        tx,
        updated,
        current,
        SubscriptionOutboxTopics.SUBSCRIPTION_REACTIVATED,
        'SubscriptionReactivated',
        'subscription.subscription.reactivated',
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // cancel — any non-terminal -> CANCELLED (terminal).
  // -------------------------------------------------------------------------

  public async cancel(
    schoolId: string,
    subscriptionId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<SubscriptionRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, subscriptionId, tx);
      if (isTerminal(current.status)) {
        throw new SubscriptionAlreadyCancelledError(subscriptionId);
      }
      assertSubscriptionTransition(current.status, 'CANCELLED');

      const updated = await this.repo.update(
        schoolId,
        subscriptionId,
        expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        tx,
      );
      await this.history.record(
        {
          schoolId,
          subscriptionId,
          action: 'CANCELLED',
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          actorReason: reason,
        },
        tx,
      );
      await this.emitLifecycle(
        tx,
        updated,
        current,
        SubscriptionOutboxTopics.SUBSCRIPTION_CANCELLED,
        'SubscriptionCancelled',
        'subscription.subscription.cancelled',
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Job-handler entry: mark expiring then expired. Called by the daily
  // expiry job inside its own transaction.
  // -------------------------------------------------------------------------

  public async markExpiring(row: SubscriptionRow, tx: PrismaTx): Promise<SubscriptionRow> {
    if (row.status !== 'ACTIVE' && row.status !== 'TRIAL') {
      return row;
    }
    assertSubscriptionTransition(row.status, 'EXPIRING');
    const updated = await this.repo.update(
      row.schoolId,
      row.id,
      row.version,
      { status: 'EXPIRING' },
      tx,
    );
    await this.history.record(
      {
        schoolId: row.schoolId,
        subscriptionId: row.id,
        action: 'EXPIRING',
        fromStatus: row.status,
        toStatus: 'EXPIRING',
      },
      tx,
    );
    await this.emitLifecycle(
      tx,
      updated,
      row,
      SubscriptionOutboxTopics.SUBSCRIPTION_EXPIRING,
      'SubscriptionExpiring',
      'subscription.subscription.expiring',
    );
    return updated;
  }

  public async markExpired(row: SubscriptionRow, tx: PrismaTx): Promise<SubscriptionRow> {
    if (row.status === 'EXPIRED' || isTerminal(row.status)) return row;
    assertSubscriptionTransition(row.status, 'EXPIRED');
    const updated = await this.repo.update(
      row.schoolId,
      row.id,
      row.version,
      { status: 'EXPIRED' },
      tx,
    );
    await this.history.record(
      {
        schoolId: row.schoolId,
        subscriptionId: row.id,
        action: 'EXPIRED',
        fromStatus: row.status,
        toStatus: 'EXPIRED',
      },
      tx,
    );
    await this.emitLifecycle(
      tx,
      updated,
      row,
      SubscriptionOutboxTopics.SUBSCRIPTION_EXPIRED,
      'SubscriptionExpired',
      'subscription.subscription.expired',
    );
    return updated;
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private async loadOrThrow(
    schoolId: string,
    id: string,
    tx: PrismaTx,
  ): Promise<SubscriptionRow> {
    const row = await this.repo.findById(schoolId, id, tx);
    if (row === null) throw new SubscriptionNotFoundError(id);
    return row;
  }

  private assertNotCancelled(row: SubscriptionRow): void {
    if (isTerminal(row.status)) {
      throw new SubscriptionAlreadyCancelledError(row.id);
    }
  }

  private async cancelInternal(
    tx: PrismaTx,
    current: SubscriptionRow,
    reason: string,
  ): Promise<void> {
    if (isTerminal(current.status)) return;
    assertSubscriptionTransition(current.status, 'CANCELLED');
    const updated = await this.repo.update(
      current.schoolId,
      current.id,
      current.version,
      {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      tx,
    );
    await this.history.record(
      {
        schoolId: current.schoolId,
        subscriptionId: current.id,
        action: 'CANCELLED',
        fromStatus: current.status,
        toStatus: 'CANCELLED',
        actorReason: reason,
      },
      tx,
    );
    await this.emitLifecycle(
      tx,
      updated,
      current,
      SubscriptionOutboxTopics.SUBSCRIPTION_CANCELLED,
      'SubscriptionCancelled',
      'subscription.subscription.cancelled',
    );
  }

  private async readPlanPricing(
    tx: PrismaTx,
    planId: string,
  ): Promise<{
    currency: string;
    monthlyPrice: number;
    yearlyPrice: number;
    trialDays: number;
  }> {
    const plan = (await tx.plan.findUnique({
      where: { id: planId },
      select: {
        currency: true,
        monthlyPrice: true,
        yearlyPrice: true,
        trialDays: true,
      } as never,
    })) as
      | {
          currency: string;
          monthlyPrice: { toString(): string } | number;
          yearlyPrice: { toString(): string } | number;
          trialDays: number;
        }
      | null;
    if (plan === null) {
      throw new SubscriptionNotFoundError(planId);
    }
    return {
      currency: plan.currency,
      monthlyPrice: Number(plan.monthlyPrice.toString()),
      yearlyPrice: Number(plan.yearlyPrice.toString()),
      trialDays: plan.trialDays,
    };
  }

  private async emitLifecycle(
    tx: PrismaTx,
    after: SubscriptionRow,
    before: SubscriptionRow | null,
    topic: typeof SubscriptionOutboxTopics[keyof typeof SubscriptionOutboxTopics],
    eventType: string,
    auditAction: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      subscriptionId: after.id,
      schoolId: after.schoolId,
      planId: after.planId,
      status: after.status,
      billingCycle: after.billingCycle,
      ...(before !== null ? { previousStatus: before.status, previousPlanId: before.planId } : {}),
    };
    await this.outbox.publish(tx, {
      topic,
      eventType,
      aggregateType: 'Subscription',
      aggregateId: after.id,
      schoolId: after.schoolId,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    await this.audit.record(
      {
        action: auditAction,
        category: 'tenancy',
        resourceType: 'Subscription',
        resourceId: after.id,
        schoolId: after.schoolId,
        ...(before !== null ? { before } : {}),
        after,
      },
      { tx: tx as unknown as AuditTxLike },
    );
    this.logger.log(
      `Subscription ${after.id} school=${after.schoolId} ${before?.status ?? 'NEW'} -> ${after.status}.`,
    );
  }
}
