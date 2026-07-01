/**
 * Sprint 7 — Timetable foundation full lifecycle e2e (service-orchestration spec).
 *
 * Mirrors the Sprint 6 pattern: no Testcontainers, no real DB, no NestJS
 * testing module — real services wired together with stubbed repos.
 *
 * Flow:
 *   1. PeriodTemplateService.create()  → outbox: period_template.created
 *   2. TimetableVersionService.create() → outbox: version.created, DRAFT
 *   3. TimetableEntryService.bulkCreate() → 3 created, 0 failed,
 *        outbox: entries.bulk_created
 *   4. TimetableVersionService.activate() → outbox: version.activated
 *   5. TimetableEntryService.create() on now-ACTIVE → VersionNotDraftError
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { PeriodTemplateService } from '../../src/core/timetable/period-template/period-template.service';
import { TimetableVersionService } from '../../src/core/timetable/version/version.service';
import { TimetableEntryService } from '../../src/core/timetable/entry/entry.service';
import { VersionNotDraftError } from '../../src/core/timetable/timetable.errors';
import type {
  PeriodTemplateWithPeriods,
  PeriodTemplatePeriodRow,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../../src/core/timetable/timetable.types';

const SCHOOL = 'sch-e2e';
const BRANCH = 'br-e2e';
const ACADEMIC_YEAR = 'ay-e2e';
const TEMPLATE_ID = 'tpl-1';
const VERSION_ID = 'ver-1';
const T0 = new Date(Date.UTC(2026, 0, 5)); // Monday
const T_FROM = new Date(Date.UTC(2026, 0, 12));

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makePeriod(overrides: Partial<PeriodTemplatePeriodRow> = {}): PeriodTemplatePeriodRow {
  return {
    id: 'p-1',
    schoolId: SCHOOL,
    periodTemplateId: TEMPLATE_ID,
    index: 1,
    label: 'P1',
    type: 'TEACHING',
    startTime: '08:00:00',
    endTime: '08:45:00',
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PeriodTemplateWithPeriods> = {}): PeriodTemplateWithPeriods {
  return {
    id: TEMPLATE_ID,
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: ACADEMIC_YEAR,
    name: 'Default',
    description: null,
    days: [1, 2, 3, 4, 5],
    isDefault: true,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    periods: [
      makePeriod({ id: 'p-1', index: 1, label: 'P1', startTime: '08:00:00', endTime: '08:45:00' }),
      makePeriod({ id: 'p-2', index: 2, label: 'P2', startTime: '08:50:00', endTime: '09:35:00' }),
      makePeriod({ id: 'p-3', index: 3, label: 'P3', startTime: '09:40:00', endTime: '10:25:00' }),
    ],
    ...overrides,
  };
}

function makeVersion(overrides: Partial<TimetableVersionRow> = {}): TimetableVersionRow {
  return {
    id: VERSION_ID,
    schoolId: SCHOOL,
    branchId: BRANCH,
    academicYearId: ACADEMIC_YEAR,
    periodTemplateId: TEMPLATE_ID,
    name: 'AY26 v1',
    status: 'DRAFT',
    effectiveFrom: T_FROM,
    effectiveTo: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimetableEntryRow> = {}): TimetableEntryRow {
  return {
    id: 'ent-1',
    schoolId: SCHOOL,
    timetableVersionId: VERSION_ID,
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: null,
    dayOfWeek: 1,
    periodIndex: 1,
    notes: null,
    createdAt: T0,
    updatedAt: T0,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

describe('Sprint 7 e2e — timetable foundation lifecycle', () => {
  it(
    'create template → create version → bulk-create entries → activate → reject create on ACTIVE',
    async () => {
      // Mutable closure state for the version "row" — flipped to ACTIVE by step 4.
      let versionState: TimetableVersionRow = makeVersion();

      // --- Mocks shared across all services ---
      const tx = {
        section: { findUnique: jest.fn(async () => ({})) },
        subject: { findUnique: jest.fn(async () => ({})) },
        staff: { findUnique: jest.fn(async () => ({})) },
        room: { findUnique: jest.fn(async () => ({})) },
      };
      const txClient = tx;
      const prisma = {
        transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
        client: txClient,
      };
      const outbox = { publish: jest.fn(async () => undefined) };
      const audit = { record: jest.fn(async () => ({ id: 'aud', rowHash: 'h' })) };
      const featureFlags = { isEnabled: jest.fn(async () => true) };

      // Repos
      const templateRepo = {
        findById: jest.fn(async (id: string) => (id === TEMPLATE_ID ? makeTemplate() : null)),
        findActiveByName: jest.fn(async () => null),
        create: jest.fn(async () => makeTemplate()),
        list: jest.fn(),
        update: jest.fn(),
        replacePeriods: jest.fn(),
        softDelete: jest.fn(),
        countActiveReferencingVersions: jest.fn(async () => 0),
        findPeriodByIndex: jest.fn(async () => makePeriod()),
      };

      const versionRepo = {
        findById: jest.fn(async (id: string) => (id === VERSION_ID ? versionState : null)),
        findActive: jest.fn(async () => null),
        list: jest.fn(),
        create: jest.fn(async () => versionState),
        update: jest.fn(),
        setStatus: jest.fn(async (_id: string, _v: number, next: 'DRAFT' | 'ACTIVE' | 'ARCHIVED', extra: { activatedAt?: Date | null; archivedAt?: Date | null }) => {
          versionState = makeVersion({
            status: next,
            activatedAt: extra.activatedAt ?? null,
            archivedAt: extra.archivedAt ?? null,
            version: versionState.version + 1,
          });
          return versionState;
        }),
        softDelete: jest.fn(),
      };

      let entryCounter = 0;
      const entryRepo = {
        findById: jest.fn(),
        findActiveBySectionSlot: jest.fn(async () => null),
        findActiveByStaffSlot: jest.fn(async () => null),
        findActiveByRoomSlot: jest.fn(async () => null),
        findActiveForStaff: jest.fn(async () => []),
        findActiveForSection: jest.fn(async () => []),
        findActiveForRoom: jest.fn(async () => []),
        findActiveForVersion: jest.fn(async () => []),
        list: jest.fn(),
        create: jest.fn(async (input: { sectionId: string; staffId: string; dayOfWeek: number; periodIndex: number }) => {
          entryCounter += 1;
          return makeEntry({
            id: `ent-${entryCounter}`,
            sectionId: input.sectionId,
            staffId: input.staffId,
            dayOfWeek: input.dayOfWeek,
            periodIndex: input.periodIndex,
          });
        }),
        update: jest.fn(),
        softDelete: jest.fn(),
      };

      // Stubbed detector + recomputer — bypass real validation.
      const detector = {
        validate: jest.fn(async () => undefined),
        scanVersion: jest.fn(),
      };
      const loadRecomputer = { recompute: jest.fn(async () => undefined) };

      // --- Real services wired together ---
      const tplSvc = new PeriodTemplateService(
        prisma as never,
        templateRepo as never,
        featureFlags as never,
        outbox as never,
        audit as never,
      );
      const verSvc = new TimetableVersionService(
        prisma as never,
        versionRepo as never,
        templateRepo as never,
        featureFlags as never,
        outbox as never,
        audit as never,
      );
      const entSvc = new TimetableEntryService(
        prisma as never,
        entryRepo as never,
        versionRepo as never,
        detector as never,
        loadRecomputer as never,
        featureFlags as never,
        outbox as never,
        audit as never,
      );

      // ---- Step 1: create PeriodTemplate ----
      const template = await withCtx(() =>
        tplSvc.create({
          branchId: BRANCH,
          academicYearId: ACADEMIC_YEAR,
          name: 'Default',
          days: [1, 2, 3, 4, 5],
          isDefault: true,
          periods: [
            { index: 1, label: 'P1', type: 'TEACHING', startTime: '08:00', endTime: '08:45' },
            { index: 2, label: 'P2', type: 'TEACHING', startTime: '08:50', endTime: '09:35' },
            { index: 3, label: 'P3', type: 'TEACHING', startTime: '09:40', endTime: '10:25' },
          ],
        }),
      );
      expect(template.id).toBe(TEMPLATE_ID);
      const publishCalls = outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; payload: Record<string, unknown> }]
      >;
      const tplEvents = publishCalls.filter(
        (c) => c[1].topic === 'timetable.period_template.created',
      );
      expect(tplEvents.length).toBe(1);

      // ---- Step 2: create TimetableVersion (DRAFT) ----
      const draft = await withCtx(() =>
        verSvc.create({
          branchId: BRANCH,
          academicYearId: ACADEMIC_YEAR,
          periodTemplateId: TEMPLATE_ID,
          name: 'AY26 v1',
          effectiveFrom: T_FROM,
        }),
      );
      expect(draft.status).toBe('DRAFT');
      const verCreatedEvents = publishCalls.filter(
        (c) => c[1].topic === 'timetable.version.created',
      );
      expect(verCreatedEvents.length).toBe(1);
      expect((verCreatedEvents[0]?.[1].payload as { status: string }).status).toBe('DRAFT');

      // ---- Step 3: bulk-create 3 entries ----
      const bulk = await withCtx(() =>
        entSvc.bulkCreate({
          timetableVersionId: VERSION_ID,
          entries: [
            { sectionId: 'sec-A', subjectId: 'sub-1', staffId: 'stf-1', dayOfWeek: 1, periodIndex: 1 },
            { sectionId: 'sec-B', subjectId: 'sub-1', staffId: 'stf-2', dayOfWeek: 1, periodIndex: 1 },
            { sectionId: 'sec-C', subjectId: 'sub-1', staffId: 'stf-3', dayOfWeek: 1, periodIndex: 1 },
          ],
        }),
      );
      expect(bulk.created).toBe(3);
      expect(bulk.failed).toBe(0);
      const bulkEvents = publishCalls.filter(
        (c) => c[1].topic === 'timetable.entries.bulk_created',
      );
      expect(bulkEvents.length).toBe(1);

      // ---- Step 4: activate version ----
      const activated = await withCtx(() => verSvc.activate(VERSION_ID, draft.version));
      expect(activated.status).toBe('ACTIVE');
      expect(versionState.status).toBe('ACTIVE');
      const activatedEvents = publishCalls.filter(
        (c) => c[1].topic === 'timetable.version.activated',
      );
      expect(activatedEvents.length).toBe(1);

      // ---- Step 5: create on ACTIVE version → VersionNotDraftError ----
      await expect(
        withCtx(() =>
          entSvc.create({
            timetableVersionId: VERSION_ID,
            sectionId: 'sec-D',
            subjectId: 'sub-1',
            staffId: 'stf-4',
            dayOfWeek: 2,
            periodIndex: 1,
          }),
        ),
      ).rejects.toBeInstanceOf(VersionNotDraftError);
    },
  );
});
