/**
 * Sprint 15 test harness — wires the Sprint 15 services (PlanFeatureService,
 * SubscriptionService, SchoolUsageService, SubscriptionGuardService) against
 * jest-mocked repositories. No DB, no Nest container.
 *
 * The mocks are deliberately permissive: each repo function defaults to a
 * jest.fn() returning a sensible empty value; specs override only the
 * functions whose behaviour they assert.
 */
import type { PlanFeatureRow, SchoolUsageRow, SubscriptionRow, UsageThresholdStateRow } from '../../src/core/subscription/subscription.types';
import { PlanFeatureService } from '../../src/core/subscription/plan-feature/plan-feature.service';
import { SubscriptionService } from '../../src/core/subscription/subscription/subscription.service';

export interface CapturedOutbox {
  topic: string;
  schoolId: string | null;
  payload: Record<string, unknown>;
}

export function makeSubscriptionRow(over: Partial<SubscriptionRow> & { id: string }): SubscriptionRow {
  return {
    schoolId: 's-1',
    planId: 'plan-growth',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    currency: 'INR',
    monthlyPrice: 999,
    yearlyPrice: 9999,
    assignedBy: null,
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    startedAt: new Date('2026-01-01T00:00:00Z'),
    expiryDate: new Date('2026-12-31T00:00:00Z'),
    cancelledAt: null,
    cancellationReason: null,
    trialEndsAt: null,
    lastRenewedAt: null,
    nextRenewalAt: null,
    autoRenew: false,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

export function makePlanFeatureRow(over: Partial<PlanFeatureRow> & { id: string; featureKey: string }): PlanFeatureRow {
  return {
    planId: 'plan-growth',
    featureType: 'LIMIT',
    mode: 'LIMITED',
    limit: 100,
    sortOrder: 0,
    description: null,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

export function makeSchoolUsageRow(over: Partial<SchoolUsageRow> = {}): SchoolUsageRow {
  return {
    id: 'usage-1',
    schoolId: 's-1',
    studentCount: 0,
    staffCount: 0,
    branchCount: 0,
    smsUsedThisPeriod: 0,
    whatsappUsedThisPeriod: 0,
    emailUsedThisPeriod: 0,
    storageBytesUsed: 0n,
    usagePeriodStart: new Date('2026-06-01T00:00:00Z'),
    usagePeriodEnd: new Date('2026-07-01T00:00:00Z'),
    lastRecomputedAt: null,
    version: 1,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  };
}

export function makeThresholdRow(over: Partial<UsageThresholdStateRow> = {}): UsageThresholdStateRow {
  return {
    id: 'thr-1',
    schoolId: 's-1',
    featureKey: 'student_count',
    lastNotifiedThreshold: null,
    lastNotifiedAt: null,
    currentPercent: 0,
    version: 1,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  };
}

/** Build a wired SubscriptionService against jest-mocked deps. */
export function buildSubscriptionService(opts: {
  current?: SubscriptionRow | null;
  plan?: { currency: string; monthlyPrice: number; yearlyPrice: number; trialDays: number };
} = {}) {
  const captured: CapturedOutbox[] = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, e: { topic: string; schoolId?: string | null; payload: Record<string, unknown> }) => {
      captured.push({ topic: e.topic, schoolId: e.schoolId ?? null, payload: e.payload });
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };

  let currentRow: SubscriptionRow | null = opts.current ?? null;
  const created: SubscriptionRow[] = [];
  const repo = {
    findById: jest.fn(async () => currentRow),
    findActiveBySchool: jest.fn(async () => currentRow),
    listBySchool: jest.fn(async () => (currentRow !== null ? [currentRow] : [])),
    listExpiring: jest.fn(async () => (currentRow !== null ? [currentRow] : [])),
    create: jest.fn(async (input: { schoolId: string; planId: string; status: SubscriptionRow['status']; billingCycle: SubscriptionRow['billingCycle']; }) => {
      const row = makeSubscriptionRow({
        id: `sub-${(created.length + 1).toString()}`,
        schoolId: input.schoolId,
        planId: input.planId,
        status: input.status,
        billingCycle: input.billingCycle,
      });
      created.push(row);
      currentRow = row;
      return row;
    }),
    update: jest.fn(async (_schoolId: string, id: string, _ev: number, patch: Partial<SubscriptionRow>) => {
      if (currentRow === null || currentRow.id !== id) {
        throw new Error('update on unknown subscription');
      }
      currentRow = { ...currentRow, ...patch, version: currentRow.version + 1 };
      return currentRow;
    }),
    softDelete: jest.fn(async () => undefined),
  };

  const history = { record: jest.fn(async () => undefined), list: jest.fn(async () => []) };

  const planPricing = opts.plan ?? { currency: 'INR', monthlyPrice: 999, yearlyPrice: 9999, trialDays: 30 };
  const txClient = {
    plan: { findUnique: jest.fn(async () => planPricing) },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    client: txClient,
  };

  const service = new SubscriptionService(
    prisma as never,
    repo as never,
    history as never,
    outbox as never,
    audit as never,
  );

  return {
    service,
    repo,
    history,
    outbox,
    audit,
    captured,
    getCurrent: () => currentRow,
    setCurrent: (r: SubscriptionRow | null) => {
      currentRow = r;
    },
    outboxTopics: () => captured.map((e) => e.topic),
  };
}

/** Build a wired PlanFeatureService against jest-mocked deps. */
export function buildPlanFeatureService(opts: { existing?: PlanFeatureRow | null } = {}) {
  const captured: CapturedOutbox[] = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, e: { topic: string; payload: Record<string, unknown> }) => {
      captured.push({ topic: e.topic, schoolId: null, payload: e.payload });
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const prisma = { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})), client: {} };

  let existing: PlanFeatureRow | null = opts.existing ?? null;
  const repo = {
    findById: jest.fn(async () => existing),
    findActiveByKey: jest.fn(async () => existing),
    listByPlan: jest.fn(async () => (existing !== null ? [existing] : [])),
    create: jest.fn(async (input: { planId: string; featureKey: string; featureType: PlanFeatureRow['featureType']; mode: PlanFeatureRow['mode']; limit?: number | null }) => {
      const row = makePlanFeatureRow({
        id: `pf-${Math.random().toString(36).slice(2, 8)}`,
        planId: input.planId,
        featureKey: input.featureKey,
        featureType: input.featureType,
        mode: input.mode,
        limit: input.limit ?? null,
      });
      existing = row;
      return row;
    }),
    update: jest.fn(async (_id: string, _ev: number, patch: Partial<PlanFeatureRow>) => {
      if (existing === null) throw new Error('update on unknown row');
      existing = { ...existing, ...patch, version: existing.version + 1 };
      return existing;
    }),
    softDelete: jest.fn(async () => {
      existing = null;
    }),
    upsertByKey: jest.fn(async () => existing!),
  };

  const service = new PlanFeatureService(
    prisma as never,
    repo as never,
    outbox as never,
    audit as never,
  );

  return { service, repo, outbox, audit, captured, outboxTopics: () => captured.map((e) => e.topic) };
}
