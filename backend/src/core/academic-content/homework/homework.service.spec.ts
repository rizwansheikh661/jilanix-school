/**
 * HomeworkService unit specs — create, publish, transitions, cancel,
 * post-publish PATCH whitelist, soft-delete guards, dispatch dedupe gating.
 */
import {
  AcademicContentOutboxTopics,
  type HomeworkPriorityValue,
} from '../academic-content.constants';
import {
  ContentDateRangeInvalidError,
  HomeworkNotEditableError,
  HomeworkNotFoundError,
} from '../academic-content.errors';
import type { HomeworkRow } from '../academic-content.types';
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
import { HomeworkService } from './homework.service';

function makeRow(overrides: Partial<HomeworkRow> = {}): HomeworkRow {
  return {
    id: 'hw-1',
    schoolId: TEST_SCHOOL_ID,
    code: 'HW-000001',
    title: 'Chapter 5 reading',
    description: null,
    instructions: null,
    academicYearId: 'ay-1',
    classId: 'cls-1',
    sectionId: 'sec-1',
    subjectId: 'sub-1',
    assignedByStaffId: 'staff-1',
    assignedDate: new Date('2026-07-01'),
    dueDate: new Date('2026-07-08'),
    priority: 'MEDIUM' as HomeworkPriorityValue,
    status: 'DRAFT',
    publishedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    attachmentCount: 0,
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

interface Harness {
  readonly svc: HomeworkService;
  readonly repo: {
    list: jest.Mock;
    findById: jest.Mock;
    findActiveByCode: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    patchStatus: jest.Mock;
    softDelete: jest.Mock;
    incrementAttachmentCount: jest.Mock;
    decrementAttachmentCount: jest.Mock;
  };
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly dispatcher: { dispatch: jest.Mock };
  readonly sequences: { nextValue: jest.Mock };
  readonly featureFlags: { isEnabled: jest.Mock };
}

function makeHarness(): Harness {
  const { prisma } = makeFakePrisma();
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(async () => null),
    create: jest.fn(
      async (input: { code: string; title: string }) =>
        makeRow({ id: 'hw-new', code: input.code, title: input.title }),
    ),
    update: jest.fn(async () => makeRow({ id: 'hw-1', title: 'updated' })),
    patchStatus: jest.fn(
      async (id: string, _v: number, patch: { status: HomeworkRow['status'] }) =>
        makeRow({ id, status: patch.status }),
    ),
    softDelete: jest.fn(),
    incrementAttachmentCount: jest.fn(),
    decrementAttachmentCount: jest.fn(),
  };
  const sequences = makeFakeSequences();
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const dispatcher = makeFakeDispatcher();
  const svc = new HomeworkService(
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

describe('HomeworkService.create', () => {
  it('allocates HW-<seq> code, persists, publishes HOMEWORK_CREATED outbox', async () => {
    const t = makeHarness();
    const row = await withTenantCtx(() =>
      t.svc.create({
        title: 'Read Chapter 5',
        academicYearId: 'ay-1',
        classId: 'cls-1',
        sectionId: 'sec-1',
        subjectId: 'sub-1',
        assignedByStaffId: 'staff-1',
        assignedDate: new Date('2026-07-01'),
        dueDate: new Date('2026-07-08'),
        priority: 'MEDIUM' as HomeworkPriorityValue,
      }),
    );
    expect(row.code).toBe('HW-000001');
    expect(t.sequences.nextValue).toHaveBeenCalled();
    expect(t.repo.create).toHaveBeenCalled();
    const outboxArgs = t.outbox.publish.mock.calls[0]![1] as { topic: string };
    expect(outboxArgs.topic).toBe(AcademicContentOutboxTopics.HOMEWORK_CREATED);
    expect(t.audit.record).toHaveBeenCalled();
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
          priority: 'MEDIUM' as HomeworkPriorityValue,
        }),
      ),
    ).rejects.toBeInstanceOf(ContentDateRangeInvalidError);
  });
});

describe('HomeworkService.update', () => {
  it('after publish, refuses to edit non-whitelisted fields (title)', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PUBLISHED' }));
    await expect(
      withTenantCtx(() =>
        t.svc.update('hw-1', 1, { title: 'renamed' } as never),
      ),
    ).rejects.toBeInstanceOf(HomeworkNotEditableError);
  });

  it('after publish, permits whitelisted dueDate change', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PUBLISHED' }));
    await withTenantCtx(() =>
      t.svc.update('hw-1', 1, { dueDate: new Date('2026-07-20') } as never),
    );
    expect(t.repo.update).toHaveBeenCalled();
  });

  it('NotFound when row missing', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withTenantCtx(() =>
        t.svc.update('missing', 1, { dueDate: new Date('2026-07-20') } as never),
      ),
    ).rejects.toBeInstanceOf(HomeworkNotFoundError);
  });
});

describe('HomeworkService.publish / close / cancel', () => {
  it('DRAFT → PUBLISHED → CLOSED happy path emits topics in order', async () => {
    const t = makeHarness();
    t.repo.findById
      .mockResolvedValueOnce(makeRow({ status: 'DRAFT' }))
      .mockResolvedValueOnce(makeRow({ status: 'PUBLISHED' }));

    await withTenantCtx(() => t.svc.publish('hw-1', 1));
    await withTenantCtx(() => t.svc.close('hw-1', 2));

    const topics = (t.outbox.publish.mock.calls as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toEqual([
      AcademicContentOutboxTopics.HOMEWORK_PUBLISHED,
      AcademicContentOutboxTopics.HOMEWORK_CLOSED,
    ]);
  });

  it('cancel from CLOSED is refused (terminal)', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'CLOSED' }));
    await expect(
      withTenantCtx(() => t.svc.cancel('hw-1', 1, 'oops')),
    ).rejects.toBeInstanceOf(HomeworkNotEditableError);
  });

  it('soft-delete refused while PUBLISHED', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'PUBLISHED' }));
    await expect(
      withTenantCtx(() => t.svc.softDelete('hw-1', 1)),
    ).rejects.toBeInstanceOf(HomeworkNotEditableError);
  });
});

describe('HomeworkService.publish — feature flag gating', () => {
  it('does NOT dispatch HOMEWORK_PUBLISHED notification when NOTIFY_ON_LIFECYCLE flag is off', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValue(makeRow({ status: 'DRAFT' }));
    t.featureFlags.isEnabled.mockImplementation(async (key: string) => {
      if (key === 'academic-content.notify-on-lifecycle') return false;
      return true;
    });
    await withTenantCtx(() => t.svc.publish('hw-1', 1));
    expect(t.dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
