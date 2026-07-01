import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type FileStorageErrorReason =
  | 'upload_too_large'
  | 'storage_write_failed'
  | 'storage_read_failed'
  | 'scan_pending'
  | 'scan_infected'
  | 'scan_failed'
  | 'driver_not_implemented'
  | 'driver_misconfigured'
  | 'acl_principal_invalid'
  | 'asset_purgeable_only_when_soft_deleted';

export class FileStorageError extends DomainError {
  public override readonly name: string = 'FileStorageError';
}

export class UploadTooLargeError extends FileStorageError {
  public override readonly name = 'UploadTooLargeError';
  constructor(args: { sizeBytes: number; capBytes: number; purpose: string }) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Upload of ${args.sizeBytes} bytes exceeds cap ${args.capBytes} for ${args.purpose}.`,
      details: { reason: 'upload_too_large' satisfies FileStorageErrorReason, ...args },
    });
  }
}

export class StorageWriteFailedError extends FileStorageError {
  public override readonly name = 'StorageWriteFailedError';
  constructor(driver: string, message: string, cause?: unknown) {
    super({
      code: ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
      message: `Storage write failed (${driver}): ${message}`,
      details: { reason: 'storage_write_failed' satisfies FileStorageErrorReason, driver },
      ...(cause !== undefined ? { cause } : {}),
    });
  }
}

export class StorageReadFailedError extends FileStorageError {
  public override readonly name = 'StorageReadFailedError';
  constructor(driver: string, message: string, cause?: unknown) {
    super({
      code: ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
      message: `Storage read failed (${driver}): ${message}`,
      details: { reason: 'storage_read_failed' satisfies FileStorageErrorReason, driver },
      ...(cause !== undefined ? { cause } : {}),
    });
  }
}

export class ScanNotCleanError extends FileStorageError {
  public override readonly name = 'ScanNotCleanError';
  constructor(args: { fileAssetId: string; scanStatus: 'PENDING' | 'INFECTED' | 'SCAN_FAILED' }) {
    const reason: FileStorageErrorReason =
      args.scanStatus === 'PENDING'
        ? 'scan_pending'
        : args.scanStatus === 'INFECTED'
          ? 'scan_infected'
          : 'scan_failed';
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `File scan status ${args.scanStatus} — download not permitted.`,
      details: { reason, ...args },
    });
  }
}

export class DriverNotImplementedError extends FileStorageError {
  public override readonly name = 'DriverNotImplementedError';
  constructor(driver: string, operation: string) {
    super({
      code: ERROR_CODES.EXTERNAL_PROVIDER_ERROR,
      message: `Storage driver "${driver}" does not implement "${operation}" yet.`,
      details: {
        reason: 'driver_not_implemented' satisfies FileStorageErrorReason,
        driver,
        operation,
      },
    });
  }
}

export class DriverMisconfiguredError extends FileStorageError {
  public override readonly name = 'DriverMisconfiguredError';
  constructor(driver: string, missing: readonly string[]) {
    super({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: `Storage driver "${driver}" misconfigured — missing: ${missing.join(', ')}.`,
      details: {
        reason: 'driver_misconfigured' satisfies FileStorageErrorReason,
        driver,
        missing: [...missing],
      },
    });
  }
}

export class AclPrincipalInvalidError extends FileStorageError {
  public override readonly name = 'AclPrincipalInvalidError';
  constructor(message: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message,
      details: { reason: 'acl_principal_invalid' satisfies FileStorageErrorReason },
    });
  }
}

export class AssetNotPurgeableError extends FileStorageError {
  public override readonly name = 'AssetNotPurgeableError';
  constructor(fileAssetId: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'File asset can only be purged after a soft-delete.',
      details: {
        reason: 'asset_purgeable_only_when_soft_deleted' satisfies FileStorageErrorReason,
        fileAssetId,
      },
    });
  }
}
