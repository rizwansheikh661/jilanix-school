/**
 * Sprint 16 unit — FileAsset enforcement wiring.
 *
 * Asserts that FileAssetService.upload:
 *   - calls guard.assertAndConsume('storage_bytes', sizeBytes) before storage.put
 *   - on storage.put failure, calls guard.releaseUsage with the same size as
 *     compensation (no row insert)
 *   - skips guard calls entirely when there is no schoolId in context
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { FileAssetService } from '../../src/core/file-storage/file-asset/file-asset.service';

function inTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: 'school-1',
    userId: 'u-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function build(opts: { putThrows?: boolean } = {}) {
  const config = {
    storage: { maxUploadBytes: 10_485_760, downloadUrlTtlSeconds: 60, publicBaseUrl: null },
    app: { baseUrl: 'http://x', globalPrefix: 'api', apiVersion: 'v1' },
  };
  const assetRepo = {
    create: jest.fn(async (row: { id: string }) => ({ ...row, createdAt: new Date(), deletedAt: null })),
    findById: jest.fn(),
    list: jest.fn(),
    softDelete: jest.fn(),
    purge: jest.fn(),
  };
  const aclRepo = {
    listForAsset: jest.fn(),
    create: jest.fn(),
    revoke: jest.fn(),
  };
  const storage = {
    driverName: 'local',
    put: jest.fn(async (input: { fileName: string; body: Buffer }) => {
      if (opts.putThrows === true) throw new Error('boom');
      return {
        bucket: 'b',
        storageKey: `k/${input.fileName}`,
        sizeBytes: input.body.byteLength,
        checksumSha256: 'sha',
      };
    }),
    get: jest.fn(),
    delete: jest.fn(async () => undefined),
    buildDownloadUrl: jest.fn(async () => null),
  };
  const guard = {
    assertAndConsume: jest.fn(async () => ({})),
    releaseUsage: jest.fn(async () => undefined),
    assertMutationAllowed: jest.fn(async () => undefined),
  };

  const svc = new FileAssetService(
    config as never,
    assetRepo as never,
    aclRepo as never,
    storage as never,
    guard as never,
  );

  return { svc, assetRepo, storage, guard };
}

describe('Sprint 16 — FileAsset enforcement', () => {
  it('upload gates on storage_bytes, releases on storage.put failure, skips on platform ctx', async () => {
    const body = Buffer.from('hello world');

    // Tenant ctx, happy path: consume runs, no release.
    const ok = build();
    await inTenantCtx(() =>
      ok.svc.upload({ purpose: 'STAFF_PHOTO', fileName: 'a.png', mimeType: 'image/png', body }),
    );
    expect(ok.guard.assertAndConsume).toHaveBeenCalledTimes(1);
    const consumeArgs = ok.guard.assertAndConsume.mock.calls[0] as unknown[];
    expect(consumeArgs[0]).toBe('school-1');
    expect(consumeArgs[1]).toBe('storage_bytes');
    expect(consumeArgs[2]).toBe(body.byteLength);
    expect(consumeArgs[3]).toBe('file:pending');
    expect(ok.storage.put).toHaveBeenCalledTimes(1);
    expect(ok.assetRepo.create).toHaveBeenCalledTimes(1);
    expect(ok.guard.releaseUsage).not.toHaveBeenCalled();

    // Tenant ctx, storage.put throws: compensating release fires with same byte count.
    const fail = build({ putThrows: true });
    await expect(
      inTenantCtx(() =>
        fail.svc.upload({ purpose: 'STAFF_PHOTO', fileName: 'a.png', mimeType: 'image/png', body }),
      ),
    ).rejects.toThrow('boom');
    expect(fail.guard.assertAndConsume).toHaveBeenCalledTimes(1);
    expect(fail.guard.releaseUsage).toHaveBeenCalledTimes(1);
    const releaseArgs = fail.guard.releaseUsage.mock.calls[0] as unknown[];
    expect(releaseArgs[1]).toBe('storage_bytes');
    expect(releaseArgs[2]).toBe(body.byteLength);
    expect(releaseArgs[3]).toBe('file:upload-failed');
    expect(fail.assetRepo.create).not.toHaveBeenCalled();

    // Platform ctx (no schoolId): no guard calls at all.
    const platform = build();
    const ctx = RequestContextRegistry.makeSystemContext({ actorScope: 'global' });
    await RequestContextRegistry.run(ctx, () =>
      platform.svc.upload({ purpose: 'STAFF_PHOTO', fileName: 'a.png', mimeType: 'image/png', body }),
    );
    expect(platform.guard.assertAndConsume).not.toHaveBeenCalled();
    expect(platform.guard.releaseUsage).not.toHaveBeenCalled();
    expect(platform.assetRepo.create).toHaveBeenCalledTimes(1);
  });
});
