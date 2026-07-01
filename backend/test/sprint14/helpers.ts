/**
 * Sprint 14 e2e harness — wires the real provisioning services
 * (SchoolLifecycleService + TrialService + TrialExpiryJobHandler) against
 * an in-memory SchoolRoot store + jest mocks for Prisma/outbox/audit.
 *
 * No real DB, no Nest application bootstrap — we exercise the service
 * orchestration boundary the same way the controllers will at runtime.
 */
import type { SchoolRootRow } from '../../src/core/school/school/school.types';
import { SchoolLifecycleService } from '../../src/core/provisioning/lifecycle/school-lifecycle.service';
import { TrialService } from '../../src/core/provisioning/trial/trial.service';
import { TrialExpiryJobHandler } from '../../src/core/provisioning/trial/trial-expiry.job-handler';
import type { JobHandlerContext } from '../../src/core/jobs/jobs.types';

export interface CapturedOutbox {
  topic: string;
  schoolId: string | null;
  payload: Record<string, unknown>;
}

export interface Sprint14Harness {
  readonly lifecycle: SchoolLifecycleService;
  readonly trials: TrialService;
  readonly trialJob: TrialExpiryJobHandler;
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly sessionUpdateMany: jest.Mock;
  outboxTopics(): string[];
  outboxByTopic(topic: string): CapturedOutbox[];
  getSchool(id: string): SchoolRootRow | undefined;
  seedSchool(row: Partial<SchoolRootRow> & { id: string }): SchoolRootRow;
  jobCtx(): JobHandlerContext;
}

export function buildSprint14Harness(): Sprint14Harness {
  const schools = new Map<string, SchoolRootRow>();
  const captured: CapturedOutbox[] = [];

  const sessionUpdateMany = jest.fn(async () => ({ count: 0 }));
  const tx = { userSession: { updateMany: sessionUpdateMany } } as unknown;

  const outbox = {
    publish: jest.fn(async (_tx: unknown, event: { topic: string; schoolId?: string | null; payload: Record<string, unknown> }) => {
      captured.push({
        topic: event.topic,
        schoolId: event.schoolId ?? null,
        payload: event.payload,
      });
      return { id: `outbox-${captured.length.toString()}` };
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };

  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    client: {},
  };

  const schoolRepo = {
    findById: jest.fn(async (id: string) => schools.get(id) ?? null),
    findBySlug: jest.fn(async (slug: string) => {
      for (const row of schools.values()) {
        if (row.slug === slug) return row;
      }
      return null;
    }),
    findExpiringTrials: jest.fn(
      async (args: { now: Date; limit: number }) => {
        const out: SchoolRootRow[] = [];
        for (const row of schools.values()) {
          if (row.lifecycleStatus !== 'TRIAL') continue;
          if (row.trialEndDate !== null && row.trialEndDate.getTime() <= args.now.getTime()) {
            out.push(row);
          }
          if (out.length >= args.limit) break;
        }
        return out;
      },
    ),
    updateLifecycle: jest.fn(
      async (id: string, expectedVersion: number, patch: Partial<SchoolRootRow>) => {
        const current = schools.get(id);
        if (!current) throw new Error(`School ${id} not found`);
        if (current.version !== expectedVersion) {
          throw new Error(
            `Optimistic-lock mismatch (have ${String(current.version)}, sent ${String(expectedVersion)})`,
          );
        }
        const updated = { ...current, ...patch, version: current.version + 1 };
        schools.set(id, updated);
        return updated;
      },
    ),
    updateTrial: jest.fn(
      async (id: string, expectedVersion: number, patch: Partial<SchoolRootRow>) => {
        const current = schools.get(id);
        if (!current) throw new Error(`School ${id} not found`);
        if (current.version !== expectedVersion) {
          throw new Error('Optimistic-lock mismatch');
        }
        const updated = { ...current, ...patch, version: current.version + 1 };
        schools.set(id, updated);
        return updated;
      },
    ),
  };

  const lifecycle = new SchoolLifecycleService(
    prisma as never,
    schoolRepo as never,
    outbox as never,
    audit as never,
  );
  const trials = new TrialService(
    prisma as never,
    schoolRepo as never,
    outbox as never,
    audit as never,
  );

  const jobRegistry = { register: jest.fn() };
  const trialJob = new TrialExpiryJobHandler(
    jobRegistry as never,
    prisma as never,
    trials,
    lifecycle,
  );

  return {
    lifecycle,
    trials,
    trialJob,
    outbox,
    audit,
    sessionUpdateMany,
    outboxTopics: () => captured.map((e) => e.topic),
    outboxByTopic: (topic: string) => captured.filter((e) => e.topic === topic),
    getSchool: (id: string) => schools.get(id),
    seedSchool: (row: Partial<SchoolRootRow> & { id: string }) => {
      const full = makeRow(row);
      schools.set(full.id, full);
      return full;
    },
    jobCtx: () => ({
      jobId: 'job-1',
      runId: 'run-1',
      runNumber: 1,
      handlerName: 'provisioning.trial.expiry-scan',
      schoolId: null,
      enqueuedAt: new Date(),
      startedAt: new Date(),
    }) as unknown as JobHandlerContext,
  };
}

function makeRow(overrides: Partial<SchoolRootRow> & { id: string }): SchoolRootRow {
  return {
    slug: 'sunrise',
    legalName: 'Sunrise Public School',
    displayName: 'Sunrise',
    countryCode: 'IN',
    gstin: null,
    pan: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateCode: null,
    pincode: null,
    phone: null,
    email: null,
    website: null,
    timezone: 'Asia/Kolkata',
    localeDefault: 'en-IN',
    status: 'trial',
    onboardedAt: null,
    archivedAt: null,
    lifecycleStatus: 'TRIAL',
    trialStartDate: new Date('2026-06-01T00:00:00Z'),
    trialEndDate: new Date('2026-07-01T00:00:00Z'),
    trialExtendedCount: 0,
    planId: 'plan-trial',
    planAssignedAt: new Date('2026-06-01T00:00:00Z'),
    planExpiresAt: null,
    planStatus: 'ASSIGNED',
    suspendedAt: null,
    suspendedReason: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}
