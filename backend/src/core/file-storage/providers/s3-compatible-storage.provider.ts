import { Injectable } from '@nestjs/common';

import { ConfigService } from '../../config';
import {
  DriverMisconfiguredError,
  DriverNotImplementedError,
} from '../file-storage.errors';
import type {
  StorageObjectLocation,
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
  StorageReadResult,
} from '../file-storage.types';

/**
 * S3CompatibleStorageProvider — stub that satisfies the `StorageProvider`
 * interface but throws `DriverNotImplementedError` on every call. Real
 * implementation is Sprint 6 (AWS SDK v3 or `@aws-sdk/client-s3`).
 *
 * Switching providers is config-only: setting `STORAGE_DRIVER=s3-compatible`
 * + the five `STORAGE_S3_*` env vars (validated at boot) flips the factory
 * to this driver. App code never imports the driver directly — it depends
 * on the `STORAGE_PROVIDER` token only.
 */
@Injectable()
export class S3CompatibleStorageProvider implements StorageProvider {
  public readonly driverName = 's3-compatible';

  constructor(config: ConfigService) {
    const missing: string[] = [];
    const s3 = config.storage.s3;
    if (s3.endpoint === undefined) missing.push('STORAGE_S3_ENDPOINT');
    if (s3.region === undefined) missing.push('STORAGE_S3_REGION');
    if (s3.bucket === undefined) missing.push('STORAGE_S3_BUCKET');
    if (s3.accessKeyId === undefined) missing.push('STORAGE_S3_ACCESS_KEY_ID');
    if (s3.secretAccessKey === undefined) missing.push('STORAGE_S3_SECRET_ACCESS_KEY');
    if (missing.length > 0) {
      throw new DriverMisconfiguredError(this.driverName, missing);
    }
  }

  public async put(_input: StoragePutInput): Promise<StoragePutResult> {
    throw new DriverNotImplementedError(this.driverName, 'put');
  }

  public async get(_loc: StorageObjectLocation): Promise<StorageReadResult> {
    throw new DriverNotImplementedError(this.driverName, 'get');
  }

  public async delete(_loc: StorageObjectLocation): Promise<void> {
    throw new DriverNotImplementedError(this.driverName, 'delete');
  }

  public async buildDownloadUrl(
    _loc: StorageObjectLocation,
    _ttlSeconds: number,
  ): Promise<string | null> {
    throw new DriverNotImplementedError(this.driverName, 'buildDownloadUrl');
  }
}
