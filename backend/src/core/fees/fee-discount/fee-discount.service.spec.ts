/**
 * FeeDiscountService unit specs — create publishes outbox + finance audit,
 * PERCENT > 100 rejected, delete refused when student assignments exist.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  DiscountValueInvalidError,
  FeesInUseError,
} from '../fees.errors';
import type { FeeDiscountRow } from '../fees.types';
import { FeeDiscountService } from './fee-discount.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeDiscount(overrides: Partial<FeeDiscountRow> = {}): FeeDiscountRow {
  return {
    id: 'fd-1',
    schoolId: SCHOOL,
    code: 'SCHOL10',
    name: 'Scholarship 10%',
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

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(),
    create: jest.fn(
      async (input: { code: string; name: string; type: string; value: number }) =>
        makeDiscount({
          id: 'fd-new',
          code: input.code,
          name: input.name,
          type: input.type as never,
          value: input.value,
        }),
    ),
    update: jest.fn(),
    softDelete: jest.fn(),
    countActiveStudentAssignments: jest.fn(async () => 0),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new FeeDiscountService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeeDiscountService.create', () => {
  it('creates a FLAT discount and publishes outbox + finance audit', async () => {
    const t = makeService();
    t.repo.findActiveByCode.mockResolvedValue(null);
    const row = await withCtx(() =>
      t.svc.create({
        code: 'SCHOL10',
        name: 'Scholarship 10%',
        type: 'FLAT',
        value: 500,
      }),
    );
    expect(row.value).toBe(500);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.DISCOUNT_CREATED,
        eventType: 'FeeDiscountCreated',
      }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ action: 'fee_discount.create', category: 'finance' }),
    );
  });

  it('rejects PERCENT value > 100 with DiscountValueInvalidError', async () => {
    const t = makeService();
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'BAD',
          name: 'Bad',
          type: 'PERCENT',
          value: 150,
        }),
      ),
    ).rejects.toBeInstanceOf(DiscountValueInvalidError);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('FeeDiscountService.softDelete', () => {
  it('refuses when active student assignments exist (FeesInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeDiscount());
    t.repo.countActiveStudentAssignments.mockResolvedValue(3);
    await expect(withCtx(() => t.svc.softDelete('fd-1', 1))).rejects.toBeInstanceOf(
      FeesInUseError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});
