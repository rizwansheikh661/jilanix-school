import { IdempotencyConflictError, IdempotencyInProgressError } from './idempotency.errors';
import { IdempotencyService } from './idempotency.service';

function makeService(repoOverrides: Partial<Record<string, jest.Mock>> = {}) {
  const repo = {
    findActive: jest.fn().mockResolvedValue(null),
    reserve: jest.fn().mockImplementation(async (input: { id: string }) => ({
      id: input.id,
      schoolId: null,
      key: 'k',
      requestFingerprint: 'fp',
      resourceType: null,
      resourceId: null,
      responseStatus: null,
      responseBody: null,
      status: 'in_progress' as const,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      completedAt: null,
    })),
    complete: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    deleteExpired: jest.fn().mockResolvedValue(0),
    ...repoOverrides,
  };
  const svc = new IdempotencyService(repo as never);
  return { svc, repo };
}

describe('IdempotencyService.computeFingerprint', () => {
  it('is deterministic for equal inputs', () => {
    const { svc } = makeService();
    const a = svc.computeFingerprint({ method: 'POST', path: '/x', body: { a: 1 } });
    const b = svc.computeFingerprint({ method: 'POST', path: '/x', body: { a: 1 } });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('upper-cases method so case differences do not collide', () => {
    const { svc } = makeService();
    const a = svc.computeFingerprint({ method: 'post', path: '/x', body: null });
    const b = svc.computeFingerprint({ method: 'POST', path: '/x', body: null });
    expect(a).toBe(b);
  });

  it('differs when body differs', () => {
    const { svc } = makeService();
    const a = svc.computeFingerprint({ method: 'POST', path: '/x', body: { a: 1 } });
    const b = svc.computeFingerprint({ method: 'POST', path: '/x', body: { a: 2 } });
    expect(a).not.toBe(b);
  });
});

describe('IdempotencyService.lookupOrReserve', () => {
  it('reserves on miss', async () => {
    const { svc, repo } = makeService();
    const res = await svc.lookupOrReserve({ schoolId: null, key: 'k', fingerprint: 'fp' });
    expect(res.kind).toBe('reserved');
    expect(repo.reserve).toHaveBeenCalledTimes(1);
  });

  it('returns hit when a completed row exists with matching fingerprint', async () => {
    const { svc, repo } = makeService({
      findActive: jest.fn().mockResolvedValue({
        id: 'i1',
        schoolId: null,
        key: 'k',
        requestFingerprint: 'fp',
        resourceType: null,
        resourceId: null,
        responseStatus: 201,
        responseBody: { ok: true },
        status: 'completed' as const,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        completedAt: new Date(),
      }),
    });
    const res = await svc.lookupOrReserve({ schoolId: null, key: 'k', fingerprint: 'fp' });
    expect(res).toEqual({ kind: 'hit', responseStatus: 201, responseBody: { ok: true } });
    expect(repo.reserve).not.toHaveBeenCalled();
  });

  it('throws conflict when fingerprint differs', async () => {
    const { svc } = makeService({
      findActive: jest.fn().mockResolvedValue({
        id: 'i1',
        schoolId: null,
        key: 'k',
        requestFingerprint: 'other-fp',
        resourceType: null,
        resourceId: null,
        responseStatus: 200,
        responseBody: null,
        status: 'completed' as const,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        completedAt: new Date(),
      }),
    });
    await expect(
      svc.lookupOrReserve({ schoolId: null, key: 'k', fingerprint: 'fp' }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('throws in-progress when prior request is still running', async () => {
    const { svc } = makeService({
      findActive: jest.fn().mockResolvedValue({
        id: 'i1',
        schoolId: null,
        key: 'k',
        requestFingerprint: 'fp',
        resourceType: null,
        resourceId: null,
        responseStatus: null,
        responseBody: null,
        status: 'in_progress' as const,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        completedAt: null,
      }),
    });
    await expect(
      svc.lookupOrReserve({ schoolId: null, key: 'k', fingerprint: 'fp' }),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);
  });
});

describe('IdempotencyService.complete', () => {
  it('persists completed when success=true', async () => {
    const { svc, repo } = makeService();
    await svc.complete({ id: 'i1', responseStatus: 200, responseBody: { ok: true }, success: true });
    expect(repo.complete).toHaveBeenCalledWith('i1', expect.objectContaining({ status: 'completed' }));
  });

  it('persists failed when success=false', async () => {
    const { svc, repo } = makeService();
    await svc.complete({ id: 'i1', responseStatus: 500, responseBody: null, success: false });
    expect(repo.complete).toHaveBeenCalledWith('i1', expect.objectContaining({ status: 'failed' }));
  });

  it('swallows repo errors (best-effort)', async () => {
    const { svc } = makeService({
      complete: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(
      svc.complete({ id: 'i1', responseStatus: 200, responseBody: null, success: true }),
    ).resolves.toBeUndefined();
  });
});

describe('IdempotencyService.releaseReservation', () => {
  it('deletes by id and swallows errors', async () => {
    const { svc, repo } = makeService({
      deleteById: jest.fn().mockRejectedValue(new Error('boom')),
    });
    await expect(svc.releaseReservation('i1')).resolves.toBeUndefined();
    expect(repo.deleteById).toHaveBeenCalledWith('i1');
  });
});
