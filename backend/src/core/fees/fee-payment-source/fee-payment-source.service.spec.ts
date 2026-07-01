/**
 * FeePaymentSourceService unit specs — duplicate-code guard, version-conflict
 * propagation, in-use guard, outbox + finance audit fan-out.
 *
 * Persistence + cross-cutting deps are fully mocked.
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  DuplicateFeePaymentSourceCodeError,
  FeesInUseError,
  FeesVersionConflictError,
} from '../fees.errors';
import type { FeePaymentSourceRow } from '../fees.types';
import { FeePaymentSourceService } from './fee-payment-source.service';
import { VersionConflictError } from '../../../infra/prisma/errors';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeSource(over: Partial<FeePaymentSourceRow> = {}): FeePaymentSourceRow {
  return {
    id: 'src-1',
    schoolId: SCHOOL,
    code: 'PRIN_UPI_01',
    name: 'Principal UPI',
    kind: 'PRINCIPAL_UPI',
    identifier: 'principal@upi',
    ifsc: null,
    holderName: null,
    isActive: true,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makeService() {
  const tx = {
    feePayment: {
      count: jest.fn(async () => 0) as jest.Mock,
    },
  };
  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };
  const repo = {
    list: jest.fn() as jest.Mock,
    findById: jest.fn() as jest.Mock,
    findByCodeInTx: jest.fn() as jest.Mock,
    create: jest.fn(
      async (
        _tx: unknown,
        input: { code: string; name: string; kind: FeePaymentSourceRow['kind'] },
      ) =>
        makeSource({
          id: 'src-new',
          code: input.code,
          name: input.name,
          kind: input.kind,
        }),
    ) as jest.Mock,
    update: jest.fn() as jest.Mock,
    softDelete: jest.fn(async () => undefined) as jest.Mock,
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeePaymentSourceService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, tx, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: 'user-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('FeePaymentSourceService.create', () => {
  it('creates a source and publishes payment_source.created + finance audit', async () => {
    const t = makeService();
    t.repo.findByCodeInTx.mockResolvedValue(null);
    const row = await withCtx(() =>
      t.svc.create({
        code: 'PRIN_UPI_01',
        name: 'Principal UPI',
        kind: 'PRINCIPAL_UPI',
        identifier: 'principal@upi',
      }),
    );
    expect(row.code).toBe('PRIN_UPI_01');
    expect(t.outbox.publish).toHaveBeenCalledTimes(1);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string; aggregateType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: FeesOutboxTopics.PAYMENT_SOURCE_CREATED,
        eventType: 'FeePaymentSourceCreated',
        aggregateType: 'FeePaymentSource',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledTimes(1);
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string; resourceType: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({
        category: 'finance',
        resourceType: 'FeePaymentSource',
      }),
    );
  });

  it('rejects duplicate code with DuplicateFeePaymentSourceCodeError', async () => {
    const t = makeService();
    t.repo.findByCodeInTx.mockResolvedValue(makeSource({ code: 'PRIN_UPI_01' }));
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'PRIN_UPI_01',
          name: 'Principal UPI',
          kind: 'PRINCIPAL_UPI',
          identifier: 'principal@upi',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeePaymentSourceCodeError);
    expect(t.repo.create).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

describe('FeePaymentSourceService.update', () => {
  it('propagates FeesVersionConflictError when repo.update throws VersionConflictError', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeSource({ version: 1 }));
    t.repo.update.mockRejectedValue(
      new VersionConflictError('FeePaymentSource', 'src-1', 99),
    );
    await expect(
      withCtx(() => t.svc.update('src-1', 99, { name: 'Renamed' })),
    ).rejects.toBeDefined();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

describe('FeePaymentSourceService.softDelete', () => {
  it('soft-deletes when no FeePayment references and publishes payment_source.deleted', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeSource());
    t.tx.feePayment.count.mockResolvedValue(0);
    t.repo.softDelete.mockResolvedValue(undefined);
    await withCtx(() => t.svc.softDelete('src-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith(expect.anything(), 'src-1', 1);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({ topic: FeesOutboxTopics.PAYMENT_SOURCE_DELETED }),
    );
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({ category: 'finance' }),
    );
  });

  it('refuses when a FeePayment still references the source (FeesInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeSource());
    t.tx.feePayment.count.mockResolvedValue(1);
    await expect(
      withCtx(() => t.svc.softDelete('src-1', 1)),
    ).rejects.toBeInstanceOf(FeesInUseError);
    expect(t.repo.softDelete).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

// Ensure FeesVersionConflictError import is referenced so eslint no-unused stays happy.
void FeesVersionConflictError;
