import { SequenceService } from './sequence.service';
import type { TenantSequenceRepository } from '../repositories/tenant-sequence.repository';
import {
  SequenceFiscalYearMalformedError,
  SequenceFiscalYearMismatchError,
  UnknownSequenceError,
} from '../sequences.errors';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ __tx: true })),
  };
  const repo: Mocked<TenantSequenceRepository> = {
    findAll: jest.fn(),
    findByName: jest.fn(),
    allocateNext: jest.fn(),
  } as unknown as Mocked<TenantSequenceRepository>;
  const svc = new SequenceService(prisma as never, repo as never);
  return { svc, prisma, repo };
}

describe('SequenceService.nextValue', () => {
  it('allocates inside a caller-supplied transaction without opening a nested one', async () => {
    const t = makeService();
    t.repo.allocateNext.mockResolvedValue({ value: 7, raw: 7n });
    const tx = { __tx: true } as never;

    const value = await t.svc.nextValue('employee', { tx });

    expect(value).toBe(7);
    expect(t.repo.allocateNext).toHaveBeenCalledWith('employee', null, tx);
    expect(t.prisma.transaction).not.toHaveBeenCalled();
  });

  it('opens its own transaction when none is supplied', async () => {
    const t = makeService();
    t.repo.allocateNext.mockResolvedValue({ value: 1, raw: 1n });

    const value = await t.svc.nextValue('admission');

    expect(value).toBe(1);
    expect(t.prisma.transaction).toHaveBeenCalled();
    expect(t.repo.allocateNext).toHaveBeenCalledWith('admission', null, expect.anything());
  });

  it('rejects an unknown sequence name', async () => {
    const t = makeService();
    await expect(t.svc.nextValue('nope')).rejects.toBeInstanceOf(UnknownSequenceError);
  });

  it('rejects a missing fiscalYear on a fiscal-scoped sequence', async () => {
    const t = makeService();
    await expect(t.svc.nextValue('invoice')).rejects.toBeInstanceOf(SequenceFiscalYearMismatchError);
  });

  it('rejects a fiscalYear supplied for an evergreen sequence', async () => {
    const t = makeService();
    await expect(
      t.svc.nextValue('employee', { fiscalYear: '2026-27' }),
    ).rejects.toBeInstanceOf(SequenceFiscalYearMismatchError);
  });

  it('rejects a malformed fiscalYear', async () => {
    const t = makeService();
    await expect(
      t.svc.nextValue('invoice', { fiscalYear: '2026-29' }),
    ).rejects.toBeInstanceOf(SequenceFiscalYearMalformedError);
  });

  it('accepts a well-formed fiscalYear on a fiscal-scoped sequence', async () => {
    const t = makeService();
    t.repo.allocateNext.mockResolvedValue({ value: 3, raw: 3n });
    const tx = {} as never;

    const value = await t.svc.nextValue('invoice', { fiscalYear: '2026-27', tx });

    expect(value).toBe(3);
    expect(t.repo.allocateNext).toHaveBeenCalledWith('invoice', '2026-27', tx);
  });
});

describe('SequenceService.peek', () => {
  it('returns 0 for a never-allocated counter', async () => {
    const t = makeService();
    t.repo.findByName.mockResolvedValue(null);

    const result = await t.svc.peek('employee');

    expect(result).toEqual({
      sequenceName: 'employee',
      fiscalYear: null,
      lastValue: 0,
      updatedAt: null,
    });
  });

  it('returns the stored lastValue for an existing counter', async () => {
    const t = makeService();
    const updatedAt = new Date('2026-06-18T10:00:00Z');
    t.repo.findByName.mockResolvedValue({
      id: 'row-1',
      schoolId: 'school-1',
      sequenceName: 'employee',
      fiscalYear: null,
      lastValue: 42,
      updatedAt,
    });

    const result = await t.svc.peek('employee');

    expect(result).toEqual({
      sequenceName: 'employee',
      fiscalYear: null,
      lastValue: 42,
      updatedAt,
    });
  });

  it('rejects an unknown sequence name', async () => {
    const t = makeService();
    await expect(t.svc.peek('nope')).rejects.toBeInstanceOf(UnknownSequenceError);
  });
});

describe('SequenceService.list', () => {
  it('returns every row from the repository', async () => {
    const t = makeService();
    t.repo.findAll.mockResolvedValue([
      {
        id: 'row-1',
        schoolId: 'school-1',
        sequenceName: 'employee',
        fiscalYear: null,
        lastValue: 5,
        updatedAt: new Date(),
      },
    ]);

    const rows = await t.svc.list();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.sequenceName).toBe('employee');
  });
});
