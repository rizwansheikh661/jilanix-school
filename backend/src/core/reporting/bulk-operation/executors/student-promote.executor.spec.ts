/**
 * StudentPromoteExecutor unit specs — preview byClass + execute happy/fail.
 */
import { BulkOperationExecutorRegistry } from './executor.registry';
import { StudentPromoteExecutor } from './student-promote.executor';

const SRC_AY = '00000000-0000-4000-8000-00000000aaaa';
const TGT_AY = '00000000-0000-4000-8000-00000000bbbb';
const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const CLASS_A = '00000000-0000-4000-8000-0000000000c1';
const SEC_A = '00000000-0000-4000-8000-0000000000d1';

function setup(opts: {
  studentRows: ReadonlyArray<Record<string, unknown>>;
  updateMany?: (data: unknown) => Promise<{ count: number }>;
}) {
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  // tx surface used by execute()
  const tx = {
    student: {
      findFirst: jest.fn(async () => opts.studentRows[0] ?? null),
      updateMany:
        opts.updateMany ?? jest.fn(async () => ({ count: 1 })),
    },
  };

  // client surface used by preview()
  const client = {
    student: {
      findMany: jest.fn(async () => opts.studentRows),
    },
  };

  const prisma = {
    client,
    transaction: jest.fn(async (fn: (rawTx: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const reg = new BulkOperationExecutorRegistry();
  const exec = new StudentPromoteExecutor(reg, prisma as never, audit as never);
  return { exec, prisma, tx, client, audit };
}

describe('StudentPromoteExecutor.preview', () => {
  it('rolls up byClass counts for the supplied studentIds', async () => {
    const t = setup({
      studentRows: [
        { id: S1, classId: CLASS_A, sectionId: SEC_A, status: 'ACTIVE' },
        { id: S2, classId: CLASS_A, sectionId: SEC_A, status: 'ACTIVE' },
      ],
    });
    const result = await t.exec.preview(
      {
        sourceAcademicYearId: SRC_AY,
        targetAcademicYearId: TGT_AY,
        studentIds: [S1, S2],
      },
      { schoolId: 'school-1', userId: 'user-1', bulkOperationId: 'bop-1' },
    );
    expect(result.targetCount).toBe(2);
    const summary = result.summary as { byClass: Record<string, number>; eligibleCount: number };
    expect(summary.byClass[CLASS_A]).toBe(2);
    expect(summary.eligibleCount).toBe(2);
  });
});

describe('StudentPromoteExecutor.execute', () => {
  it('records success for an updated student row', async () => {
    const t = setup({
      studentRows: [
        {
          id: S1,
          academicYearId: SRC_AY,
          sectionId: SEC_A,
          status: 'ACTIVE',
          version: 1,
        },
      ],
      updateMany: jest.fn(async () => ({ count: 1 })),
    });
    const result = await t.exec.execute(
      {
        sourceAcademicYearId: SRC_AY,
        targetAcademicYearId: TGT_AY,
        studentIds: [S1],
      },
      { schoolId: 'school-1', userId: 'user-1', bulkOperationId: 'bop-1' },
    );
    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.perTarget[0]!.ok).toBe(true);
  });

  it('records failure when updateMany count=0 (version conflict)', async () => {
    const t = setup({
      studentRows: [
        {
          id: S1,
          academicYearId: SRC_AY,
          sectionId: SEC_A,
          status: 'ACTIVE',
          version: 1,
        },
      ],
      updateMany: jest.fn(async () => ({ count: 0 })),
    });
    const result = await t.exec.execute(
      {
        sourceAcademicYearId: SRC_AY,
        targetAcademicYearId: TGT_AY,
        studentIds: [S1],
      },
      { schoolId: 'school-1', userId: 'user-1', bulkOperationId: 'bop-1' },
    );
    expect(result.succeededCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.perTarget[0]!.ok).toBe(false);
    expect(result.perTarget[0]!.error).toMatch(/version conflict/i);
  });
});
