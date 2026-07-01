/**
 * AssignmentService unit specs — create with marks validation, transitions,
 * post-publish field guard, soft-delete refusal, and dispatch gating.
 */
import {
  AcademicContentOutboxTopics,
} from '../academic-content.constants';
import {
  AssignmentMarksInvalidError,
  AssignmentNotEditableError,
  AssignmentNotFoundError,
  ContentDateRangeInvalidError,
} from '../academic-content.errors';
import type { AssignmentRow } from '../academic-content.types';
import {
  TEST_NOW,
  TEST_SCHOOL_ID,
  makeFakeAudit,
  makeFakeDispatcher,
  makeFakeFeatureFlags,
  makeFakeOutbox,
  makeFakePrisma,
  makeFakeSequences,
  withTenantCtx,
} from '../__test__/test-harness';
import { AssignmentService } from './assignment.service';

function makeRow(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'asgn-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'ASGN-000001',
    title: 'Algebra worksheet',
    description: null,
    academicYearId: 'ay-1',
    classId: 'cls-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    assignedByStaffId: 'staff-1',
    assignedDate: new Date('2026-07-01'),
    dueDate: new Date('2026-07-08'),
    maxMarks: 100,
    passingMarks: 40,
    status: 'DRAFT',
    publishedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    submissionCount: 0,
    evaluatedCount: 0,
    lateCount: 0,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    createdBy: 'user-1',
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  };
}

function makeHarness() {
  const { prisma } = makeFakePrisma();
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(async () => null),
    create: jest.fn(
      async (input: { code: string; title: string; maxMarks: number; passingMarks: number }) =>
        makeRow({
          id: 'asgn-new',
          code: input.code,
          title: input.title,
          maxMarks: input.maxMarks,
          passingMarks: input.passingMarks,
        }),
    ),
    update: jest.fn(async () => makeRow({ id: 'asgn-1' })),
    patchStatus: jest.fn(
      async (id: string, _v: number, patch: { status: AssignmentRow['status'] }) =>
        makeRow({ id, status: patch.status }),
    ),
    softDelete: jest.fn(),
    bumpCounters: jest.fn(async () => 1),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const dispatcher = makeFakeDispatcher();
  const svc = new AssignmentService(
    prisma as never,
    repo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  return { svc, repo, outbox, audit, dispatcher, sequences, featureFlags };
}

describe('AssignmentService.create', () => {
  it('allocates ASGN-<seq> code, publishes ASSIGNMENT_CREATED outbox', async () => {
    const t = makeHarness();
    const row = await withTenantCtx(() =>
      t.svc.create({
        title: 'Algebra worksheet',
        academicYearId: 'ay-1',
        classId: 'cls-1',
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        assignedByStaffId: 'staff-1',
        assignedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-07-08'),
        maxMarks: 100,
        passingMarks: 40,
      }),
    );
    expect(row.code).toBe('ASGN-000001');
    expect(t.repo.create).toHaveBeenCalled();
    const topics = t.outbox.publish.mock.calls.map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toContain(AcademicContentOutboxTopics.ASSIGNMENT_CREATED);
  });

  it('rejects when passingMarks > maxMarks', async () => {
    const t = makeHarness();
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          title: 'Bad marks',
          academicYearId: 'ay-1',
          classId: 'cls-1',
          sectionId: 'sec-1',
          subjectId: 'sub-1',
          assignedByStaffId: 'staff-1',
          assignedDate: new Date('2026-07-01'),
          dueDate: new Date('2026-07-08'),
          maxMarks: 50,
          passingMarks: 80,
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentMarksInvalidError);
  });

  it('rejects when dueDate < assignedDate', async () => {
    const t = makeHarness();
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          title: 'Bad dates',
          academicYearId: 'ay-1',
          classId: 'cls-1',
          sectionId: 'sec-1',
          subjectId: 'sub-1',
          assignedByStaffId: 'staff-1',
          assignedDate: new Date('2026-07-10'),
          dueDate: new Date('2026-07-01'),
          maxMarks: 100,
          passingMarks: 40,
        }),
      ),
    ).rejects.toBeInstanceOf(ContentDateRangeInvalidError);
  });
});

describe('AssignmentService.update', () => {
  it('after publish, refuses to edit title (not whitelisted)', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PUBLISHED' }));
    await expect(
      withTenantCtx(() =>
        t.svc.update('asgn-1', 1, { title: 'renamed' } as never),
      ),
    ).rejects.toBeInstanceOf(AssignmentNotEditableError);
  });

  it('NotFound when missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() =>
        t.svc.update('missing', 1, { dueDate: new Date('2026-07-15') } as never),
      ),
    ).rejects.toBeInstanceOf(AssignmentNotFoundError);
  });
});

describe('AssignmentService lifecycle', () => {
  it('DRAFT → PUBLISHED → CLOSED emits topics in order', async () => {
    const t = makeHarness();
    t.repo.findById
      .mockResolvedValueOnce(makeRow({ status: 'DRAFT' }))
      .mockResolvedValueOnce(makeRow({ status: 'PUBLISHED' }));
    await withTenantCtx(() => t.svc.publish('asgn-1', 1));
    await withTenantCtx(() => t.svc.close('asgn-1', 2));
    const topics = t.outbox.publish.mock.calls.map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toEqual([
      AcademicContentOutboxTopics.ASSIGNMENT_PUBLISHED,
      AcademicContentOutboxTopics.ASSIGNMENT_CLOSED,
    ]);
  });

  it('soft-delete refused while PUBLISHED', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PUBLISHED' }));
    await expect(
      withTenantCtx(() => t.svc.softDelete('asgn-1', 1)),
    ).rejects.toBeInstanceOf(AssignmentNotEditableError);
  });
});
