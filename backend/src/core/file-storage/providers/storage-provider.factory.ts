import { Logger, type Provider } from '@nestjs/common';

import { ConfigService } from '../../config';
import { STORAGE_PROVIDER } from '../file-storage.constants';
import { LocalStorageProvider } from './local-storage.provider';
import { S3CompatibleStorageProvider } from './s3-compatible-storage.provider';
import type { StorageProvider } from './storage-provider';

/**
 * Nest provider that resolves `STORAGE_PROVIDER` from the active driver
 * configured by `STORAGE_DRIVER`. Adding AWS S3 / DO Spaces / R2 / MinIO is
 * a new branch in the switch plus a new provider class — no consumer change.
 */
export const StorageProviderProvider: Provider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): StorageProvider => {
    const logger = new Logger('StorageProviderFactory');
    const driver = config.storage.driver;
    switch (driver) {
      case 'local': {
        logger.log(`storage driver: local (root=${config.storage.localRoot})`);
        return new LocalStorageProvider(config);
      }
      case 's3-compatible': {
        logger.log(`storage driver: s3-compatible (bucket=${config.storage.s3.bucket ?? '?'})`);
        return new S3CompatibleStorageProvider(config);
      }
      default: {
        const exhaustive: never = driver;
        throw new Error(`Unknown STORAGE_DRIVER: ${exhaustive}`);
      }
    }
  },
};
