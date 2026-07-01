/**
 * StudentFeeDiscountService unit specs — assign/approve/unassign with
 * outbox publication and finance audit; FeeDiscount existence guard.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import { FeeDiscountNotFoundError } from '../fees.errors';
import type { FeeDiscountRow, StudentFeeDiscountRow } from '../fees.types';
import { StudentFeeDiscountService } from './student-fee-discount.service';

const SCHOOL = 'school-1';
const USER = 'user-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeDiscount(overrides: Partial<FeeDiscountRow> = {}): FeeDiscountRow {
  return {
    id: 'fd-1',
    schoolId: SCHOOL,
    code: 'SCHOL10',
    name: 'Scholarship',
    type: 'FLAT',
    value: 500,
    maxAmount: null,
    appliesToFeeHeadId: null,
    description: null,
    requiresApprovalAbove: null,
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

function makeAssignment(overrides: Partial<StudentFeeDiscountRow> = {}): StudentFeeDiscountRow {
  return {
    id: 'sfd-1',
    schoolId: SCHOOL,
    studentId: 'st-1',
    feeDiscountId: 'fd-1',
    academicYearId: 'ay-1',
    validFrom: NOW,
    validTo: null,
    reason: null,
    approvedAt: null,
    approvedBy: null,
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

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(
      async (input: { studentId: string; feeDiscountId: string; academicYearId: string }) =>
        makeAssignment({
          id: 'sfd-new',
          studentId: input.studentId,
          feeDiscountId: input.feeDiscountId,
          academicYearId: input.academicYearId,
        }),
    ),
    approve: jest.fn(
      async (id: string, _v: number, approvedBy: string | null) =>
        makeAssignment({ id, approvedAt: NOW, approvedBy, version: 2 }),
    ),
    softDelete: jest.fn(async () => undefined),
  };
  const discountRepo = { findById: jest.fn() };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new StudentFeeDiscountService(
    prisma as never,
    repo as never,
    discountRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, discountRepo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('StudentFeeDiscountService.create', () => {
  it('assigns discount to student and publishes student_discount.assigned', async () => {
    const t = makeService();
    t.discountRepo.findById.mockResolvedValue(makeDiscount());
    const row = await withCtx(() =>
      t.svc.create({
        studentId: 'st-1',
        feeDiscountId: 'fd-1',
        academicYearId: 'ay-1',
        validFrom: NOW,
      }),
    );
    expect(row.studentId).toBe('st-1');
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_ASSIGNED,
        eventType: 'StudentFeeDiscountAssigned',
      }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'student_fee_discount.assign', category: 'finance' }),
    );
  });

  it('rejects if underlying FeeDiscount not found (FeeDiscountNotFoundError)', async () => {
    const t = makeService();
    t.discountRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.create({
          studentId: 'st-1',
          feeDiscountId: 'missing',
          academicYearId: 'ay-1',
          validFrom: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(FeeDiscountNotFoundError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('StudentFeeDiscountService.approve', () => {
  it('flips approvedAt/approvedBy, bumps version, and publishes student_discount.approved', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment({ version: 1 }));
    const row = await withCtx(() => t.svc.approve('sfd-1', 1));
    expect(row.approvedAt).not.toBeNull();
    expect(row.approvedBy).toBe(USER);
    expect(row.version).toBe(2);
    expect(t.repo.approve).toHaveBeenCalledWith('sfd-1', 1, USER, expect.anything());
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_APPROVED,
        eventType: 'StudentFeeDiscountApproved',
      }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'student_fee_discount.approve', category: 'finance' }),
    );
  });
});

describe('StudentFeeDiscountService.softDelete', () => {
  it('publishes student_discount.unassigned on soft-delete', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment());
    await withCtx(() => t.svc.softDelete('sfd-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith('sfd-1', 1, expect.anything());
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_UNASSIGNED,
        eventType: 'StudentFeeDiscountUnassigned',
      }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'student_fee_discount.unassign', category: 'finance' }),
    );
  });
});
