/**
 * TimetableConflictDetectorService unit specs — one `it()` per gate
 * outcome covering PERIOD_OUT_OF_TEMPLATE, NON_WORKING_DAY, double-
 * booking trio, ROOM_DISALLOWED_TYPE, TEACHER_NOT_QUALIFIED (and the
 * flag bypass), TEACHER_UNAVAILABLE, plus happy-path + excludeEntryId.
 */
import { RequestContextRegistry } from '../../request-context';
import { TimetableConflictDetectorService, type ValidateEntryInput } from './conflict-detector.service';
import {
  NonWorkingDayError,
  PeriodOutOfTemplateError,
  RoomDisallowedTypeError,
  RoomDoubleBookedError,
  SectionDoubleBookedError,
  TeacherDoubleBookedError,
  TeacherNotQualifiedError,
  TeacherUnavailableError,
} from '../timetable.errors';
import type {
  PeriodTemplatePeriodRow,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../timetable.types';

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 0, 5));

function makeVersion(overrides: Partial<TimetableVersionRow> = {}): TimetableVersionRow {
  return {
    id: 'ver-1',
    schoolId: SCHOOL,
    branchId: 'br-1',
    academicYearId: 'ay-1',
    periodTemplateId: 'tpl-1',
    name: 'V1',
    status: 'DRAFT',
    effectiveFrom: NOW,
    effectiveTo: null,
    activatedAt: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
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
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: 'rm-1',
    dayOfWeek: 1,
    periodIndex: 1,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<PeriodTemplatePeriodRow> = {}): PeriodTemplatePeriodRow {
  return {
    id: 'pp-1',
    schoolId: SCHOOL,
    periodTemplateId: 'tpl-1',
    index: 1,
    label: 'P1',
    type: 'TEACHING',
    startTime: '09:00:00',
    endTime: '09:45:00',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  };
}

interface Harness {
  svc: TimetableConflictDetectorService;
  versionRepo: { findById: jest.Mock };
  templateRepo: { findPeriodByIndex: jest.Mock };
  entryRepo: {
    findActiveBySectionSlot: jest.Mock;
    findActiveByStaffSlot: jest.Mock;
    findActiveByRoomSlot: jest.Mock;
    findActiveForVersion: jest.Mock;
  };
  conflictRepo: { create: jest.Mock };
  workingDay: { resolve: jest.Mock };
  availability: { isAvailable: jest.Mock };
  featureFlags: { isEnabled: jest.Mock };
  roomFindUnique: jest.Mock;
  qualFindUnique: jest.Mock;
}

function makeHarness(): Harness {
  const roomFindUnique = jest.fn(async () => ({ roomType: { id: 'rt-1', allowsTimetable: true } }));
  const qualFindUnique = jest.fn(async () => ({ id: 'q-1' }));
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {
      room: { findUnique: roomFindUnique },
      staffSubjectQualification: { findUnique: qualFindUnique },
    },
  };
  const versionRepo = { findById: jest.fn(async () => makeVersion()) };
  const templateRepo = { findPeriodByIndex: jest.fn(async () => makePeriod()) };
  const entryRepo = {
    findActiveBySectionSlot: jest.fn(async () => null),
    findActiveByStaffSlot: jest.fn(async () => null),
    findActiveByRoomSlot: jest.fn(async () => null),
    findActiveForVersion: jest.fn(async () => []),
  };
  const conflictRepo = { create: jest.fn(async () => undefined) };
  const workingDay = { resolve: jest.fn(async () => ({ isWorking: true })) };
  const availability = { isAvailable: jest.fn(async () => true) };
  const featureFlags = { isEnabled: jest.fn(async () => false) };
  const svc = new TimetableConflictDetectorService(
    prisma as never,
    versionRepo as never,
    templateRepo as never,
    entryRepo as never,
    conflictRepo as never,
    workingDay as never,
    availability as never,
    featureFlags as never,
  );
  return {
    svc,
    versionRepo,
    templateRepo,
    entryRepo,
    conflictRepo,
    workingDay,
    availability,
    featureFlags,
    roomFindUnique,
    qualFindUnique,
  };
}

function input(overrides: Partial<ValidateEntryInput> = {}): ValidateEntryInput {
  return {
    timetableVersionId: 'ver-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    staffId: 'stf-1',
    roomId: 'rm-1',
    dayOfWeek: 1,
    periodIndex: 1,
    ...overrides,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('TimetableConflictDetectorService.validate', () => {
  it('PERIOD_OUT_OF_TEMPLATE when findPeriodByIndex returns null', async () => {
    const h = makeHarness();
    h.templateRepo.findPeriodByIndex.mockResolvedValue(null);
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      PeriodOutOfTemplateError,
    );
  });

  it('PERIOD_OUT_OF_TEMPLATE when period.type is BREAK', async () => {
    const h = makeHarness();
    h.templateRepo.findPeriodByIndex.mockResolvedValue(makePeriod({ type: 'BREAK' }));
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      PeriodOutOfTemplateError,
    );
  });

  it('NON_WORKING_DAY when workingDay.resolve returns isWorking=false', async () => {
    const h = makeHarness();
    h.workingDay.resolve.mockResolvedValue({ isWorking: false });
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      NonWorkingDayError,
    );
  });

  it('SECTION_DOUBLE_BOOKED when an existing entry occupies the slot', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveBySectionSlot.mockResolvedValue(makeEntry({ id: 'ent-other' }));
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      SectionDoubleBookedError,
    );
  });

  it('TEACHER_DOUBLE_BOOKED when an existing entry uses the same staff slot', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveByStaffSlot.mockResolvedValue(makeEntry({ id: 'ent-other' }));
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      TeacherDoubleBookedError,
    );
  });

  it('ROOM_DOUBLE_BOOKED when an existing entry uses the same room slot', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveByRoomSlot.mockResolvedValue(makeEntry({ id: 'ent-other' }));
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      RoomDoubleBookedError,
    );
  });

  it('ROOM_DISALLOWED_TYPE when roomType.allowsTimetable is false', async () => {
    const h = makeHarness();
    h.roomFindUnique.mockResolvedValue({ roomType: { id: 'rt-1', allowsTimetable: false } });
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      RoomDisallowedTypeError,
    );
  });

  it('TEACHER_NOT_QUALIFIED when qualification missing and flag is off', async () => {
    const h = makeHarness();
    h.qualFindUnique.mockResolvedValue(null);
    h.featureFlags.isEnabled.mockResolvedValue(false);
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      TeacherNotQualifiedError,
    );
  });

  it('flag bypass — qualification check skipped when allow_unqualified_teacher=true', async () => {
    const h = makeHarness();
    h.qualFindUnique.mockResolvedValue(null);
    h.featureFlags.isEnabled.mockResolvedValue(true);
    await expect(withCtx(() => h.svc.validate(input()))).resolves.toBeUndefined();
    expect(h.qualFindUnique).not.toHaveBeenCalled();
  });

  it('TEACHER_UNAVAILABLE when availability.isAvailable is false', async () => {
    const h = makeHarness();
    h.availability.isAvailable.mockResolvedValue(false);
    await expect(withCtx(() => h.svc.validate(input()))).rejects.toBeInstanceOf(
      TeacherUnavailableError,
    );
  });

  it('happy path — all gates green resolves without throwing', async () => {
    const h = makeHarness();
    await expect(withCtx(() => h.svc.validate(input()))).resolves.toBeUndefined();
  });

  it('excludeEntryId — same-id existing section row is ignored', async () => {
    const h = makeHarness();
    h.entryRepo.findActiveBySectionSlot.mockResolvedValue(makeEntry({ id: 'X' }));
    await expect(
      withCtx(() => h.svc.validate(input({ excludeEntryId: 'X' }))),
    ).resolves.toBeUndefined();
  });
});
