/**
 * SyllabusService unit specs — header create + duplicate guard, node
 * hierarchy validation (UNIT/CHAPTER/TOPIC parent rules), and topic-
 * completion percentage recompute.
 */
import {
  AcademicContentOutboxTopics,
  type SyllabusNodeStatusValue,
  type SyllabusNodeTypeValue,
  type SyllabusStatusValue,
} from '../academic-content.constants';
import {
  DuplicateSyllabusError,
  SyllabusNodeHierarchyInvalidError,
  SyllabusNodeNotCompletableError,
  SyllabusNotFoundError,
} from '../academic-content.errors';
import type {
  SyllabusNodeRow,
  SyllabusRow,
} from '../academic-content.types';
import {
  TEST_NOW,
  TEST_SCHOOL_ID,
  makeFakeAudit,
  makeFakeFeatureFlags,
  makeFakeOutbox,
  makeFakePrisma,
  withTenantCtx,
} from '../__test__/test-harness';
import { SyllabusService } from './syllabus.service';

function makeSyllabus(overrides: Partial<SyllabusRow> = {}): SyllabusRow {
  return {
    id: 'syl-1',
    schoolId: TEST_SCHOOL_ID,
    academicYearId: 'ay-1',
    classId: 'cls-1',
    subjectId: 'sub-1',
    status: 'NOT_STARTED' as SyllabusStatusValue,
    plannedCompletionDate: null,
    actualCompletionDate: null,
    completionPercent: 0,
    ownedByStaffId: null,
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

function makeNode(overrides: Partial<SyllabusNodeRow> = {}): SyllabusNodeRow {
  return {
    id: 'node-1',
    schoolId: TEST_SCHOOL_ID,
    syllabusId: 'syl-1',
    parentNodeId: null,
    nodeType: 'UNIT' as SyllabusNodeTypeValue,
    name: 'Unit 1',
    sequence: 1,
    plannedCompletionDate: null,
    actualCompletionDate: null,
    status: 'NOT_STARTED' as SyllabusNodeStatusValue,
    completedByStaffId: null,
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
    findById: jest.fn<Promise<SyllabusRow | null>, [string, unknown?]>(
      async () => makeSyllabus(),
    ),
    findActive: jest.fn<Promise<SyllabusRow | null>, [string, string, string, unknown?]>(
      async () => null,
    ),
    create: jest.fn(async () => makeSyllabus({ id: 'syl-new' })),
    update: jest.fn(async () => makeSyllabus({ id: 'syl-1' })),
    softDelete: jest.fn(),
    recomputeCompletion: jest.fn(
      async (
        id: string,
        percent: number,
        status: SyllabusStatusValue,
        _actualCompletionDate: Date | null,
        _tx?: unknown,
      ) => makeSyllabus({ id, completionPercent: percent, status }),
    ),
    findNodeById: jest.fn(),
    listNodes: jest.fn(async () => []),
    countTopics: jest.fn(async () => ({ total: 0, completed: 0 })),
    createNode: jest.fn(
      async (input: {
        syllabusId: string;
        nodeType: SyllabusNodeTypeValue;
        parentNodeId?: string | null;
        name: string;
      }) =>
        makeNode({
          id: 'node-new',
          syllabusId: input.syllabusId,
          parentNodeId: input.parentNodeId ?? null,
          nodeType: input.nodeType,
          name: input.name,
        }),
    ),
    updateNode: jest.fn(
      async (
        id: string,
        _v: number,
        input: { status?: SyllabusNodeStatusValue },
      ) =>
        makeNode({
          id,
          status: (input.status ?? 'NOT_STARTED') as SyllabusNodeStatusValue,
        }),
    ),
    softDeleteNode: jest.fn(),
  };
  const featureFlags = makeFakeFeatureFlags(true);
  const outbox = makeFakeOutbox();
  const audit = makeFakeAudit();
  const svc = new SyllabusService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, outbox, audit };
}

describe('SyllabusService.create', () => {
  it('creates header and emits SYLLABUS_CREATED', async () => {
    const t = makeHarness();
    const row = await withTenantCtx(() =>
      t.svc.create({
        academicYearId: 'ay-1',
        classId: 'cls-1',
        subjectId: 'sub-1',
      }),
    );
    expect(row.id).toBe('syl-new');
    const topics = t.outbox.publish.mock.calls.map(
      (c) => (c[1] as { topic: string }).topic,
    );
    expect(topics).toContain(AcademicContentOutboxTopics.SYLLABUS_CREATED);
  });

  it('refuses duplicate active syllabus for (year, class, subject)', async () => {
    const t = makeHarness();
    t.repo.findActive.mockResolvedValueOnce(makeSyllabus());
    await expect(
      withTenantCtx(() =>
        t.svc.create({
          academicYearId: 'ay-1',
          classId: 'cls-1',
          subjectId: 'sub-1',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateSyllabusError);
  });
});

describe('SyllabusService.upsertNode hierarchy', () => {
  it('UNIT must have null parentNodeId', async () => {
    const t = makeHarness();
    await expect(
      withTenantCtx(() =>
        t.svc.upsertNode({
          syllabusId: 'syl-1',
          nodeType: 'UNIT',
          name: 'U1',
          sequence: 1,
          parentNodeId: 'some-parent',
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeHierarchyInvalidError);
  });

  it('CHAPTER must have UNIT parent', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'node-bad', nodeType: 'TOPIC' }),
    );
    await expect(
      withTenantCtx(() =>
        t.svc.upsertNode({
          syllabusId: 'syl-1',
          nodeType: 'CHAPTER',
          parentNodeId: 'node-bad',
          name: 'C1',
          sequence: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeHierarchyInvalidError);
  });

  it('TOPIC must have CHAPTER parent (UNIT parent refused)', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'unit-1', nodeType: 'UNIT' }),
    );
    await expect(
      withTenantCtx(() =>
        t.svc.upsertNode({
          syllabusId: 'syl-1',
          nodeType: 'TOPIC',
          parentNodeId: 'unit-1',
          name: 'T1',
          sequence: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeHierarchyInvalidError);
  });

  it('TOPIC under CHAPTER (in same syllabus) is permitted', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'chap-1', nodeType: 'CHAPTER', syllabusId: 'syl-1' }),
    );
    const node = await withTenantCtx(() =>
      t.svc.upsertNode({
        syllabusId: 'syl-1',
        nodeType: 'TOPIC',
        parentNodeId: 'chap-1',
        name: 'T1',
        sequence: 1,
      }),
    );
    expect(node.id).toBe('node-new');
    expect(node.nodeType).toBe('TOPIC');
  });

  it('refuses when syllabus does not exist', async () => {
    const t = makeHarness();
    t.repo.findById.mockResolvedValueOnce(null);
    await expect(
      withTenantCtx(() =>
        t.svc.upsertNode({
          syllabusId: 'missing',
          nodeType: 'UNIT',
          name: 'U',
          sequence: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNotFoundError);
  });
});

describe('SyllabusService.completeTopic', () => {
  it('only TOPIC nodes are completable', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'unit-1', nodeType: 'UNIT' }),
    );
    await expect(
      withTenantCtx(() =>
        t.svc.completeTopic('unit-1', 1, {
          completedByStaffId: 'staff-1',
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeNotCompletableError);
  });

  it('completing a TOPIC recomputes syllabus % bottom-up', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'topic-1', nodeType: 'TOPIC', syllabusId: 'syl-1' }),
    );
    t.repo.countTopics.mockResolvedValueOnce({ total: 4, completed: 1 });
    const result = await withTenantCtx(() =>
      t.svc.completeTopic('topic-1', 1, {
        completedByStaffId: 'staff-1',
      }),
    );
    expect(t.repo.recomputeCompletion).toHaveBeenCalled();
    const call = t.repo.recomputeCompletion.mock.calls[0]!;
    expect(call[1]).toBe(25); // (1/4)*100
    expect(call[2]).toBe('IN_PROGRESS');
    expect(result.syllabus.completionPercent).toBe(25);
  });

  it('completing the last TOPIC marks syllabus COMPLETED with actualCompletionDate', async () => {
    const t = makeHarness();
    t.repo.findNodeById.mockResolvedValueOnce(
      makeNode({ id: 'topic-1', nodeType: 'TOPIC', syllabusId: 'syl-1' }),
    );
    t.repo.countTopics.mockResolvedValueOnce({ total: 2, completed: 2 });
    await withTenantCtx(() =>
      t.svc.completeTopic('topic-1', 1, {
        completedByStaffId: 'staff-1',
      }),
    );
    const call = t.repo.recomputeCompletion.mock.calls[0]!;
    expect(call[1]).toBe(100);
    expect(call[2]).toBe('COMPLETED');
    expect(call[3]).toBeInstanceOf(Date);
  });
});
