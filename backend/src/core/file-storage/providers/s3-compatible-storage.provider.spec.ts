import { DriverMisconfiguredError, DriverNotImplementedError } from '../file-storage.errors';
import { S3CompatibleStorageProvider } from './s3-compatible-storage.provider';

function makeConfig(s3Overrides: Partial<{
  endpoint: string | undefined;
  region: string | undefined;
  bucket: string | undefined;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
}> = {}) {
  return {
    storage: {
      s3: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        bucket: 'b',
        accessKeyId: 'k',
        secretAccessKey: 's',
        forcePathStyle: true,
        ...s3Overrides,
      },
    },
  } as never;
}

describe('S3CompatibleStorageProvider', () => {
  it('throws DriverMisconfiguredError when required env keys are missing', () => {
    expect(
      () =>
        new S3CompatibleStorageProvider(
          makeConfig({ endpoint: undefined, region: undefined }),
        ),
    ).toThrow(DriverMisconfiguredError);
  });

  it('constructs cleanly when all required S3 settings are present', () => {
    const provider = new S3CompatibleStorageProvider(makeConfig());
    expect(provider.driverName).toBe('s3-compatible');
  });

  it('every operation throws DriverNotImplementedError', async () => {
    const provider = new S3CompatibleStorageProvider(makeConfig());
    await expect(provider.put({} as never)).rejects.toBeInstanceOf(DriverNotImplementedError);
    await expect(provider.get({} as never)).rejects.toBeInstanceOf(DriverNotImplementedError);
    await expect(provider.delete({} as never)).rejects.toBeInstanceOf(DriverNotImplementedError);
    await expect(provider.buildDownloadUrl({} as never, 60)).rejects.toBeInstanceOf(
      DriverNotImplementedError,
    );
  });
});
