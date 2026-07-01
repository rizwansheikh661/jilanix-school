import type { FilePurpose, FileScanStatus, FilePrincipalType } from '@prisma/client';

export type { FilePurpose, FileScanStatus, FilePrincipalType };

export interface FileAssetRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly purpose: FilePurpose;
  readonly bucket: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  readonly checksumSha256: string;
  readonly isPublic: boolean;
  readonly scanStatus: FileScanStatus;
  readonly scanCompletedAt: Date | null;
  readonly ownerUserId: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface FileAssetAclGrantRow {
  readonly id: string;
  readonly fileAssetId: string;
  readonly schoolId: string | null;
  readonly principalType: FilePrincipalType;
  readonly principalId: string | null;
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
  readonly grantedBy: string | null;
  readonly revokedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** Where a stored object lives. Opaque to callers — created by the provider. */
export interface StorageObjectLocation {
  readonly bucket: string;
  readonly storageKey: string;
}

/** Output of `StorageProvider.put`. */
export interface StoragePutResult extends StorageObjectLocation {
  readonly sizeBytes: number;
  readonly checksumSha256: string;
}

/** Input to `StorageProvider.put`. */
export interface StoragePutInput {
  readonly schoolId: string | null;
  readonly purpose: FilePurpose;
  readonly fileName: string;
  readonly mimeType: string;
  /** Either a Buffer (small file) or a NodeJS Readable. */
  readonly body: Buffer | NodeJS.ReadableStream;
  /** Optional explicit size — required when body is a stream and we don't want to buffer. */
  readonly sizeBytes?: number;
}

export interface StorageReadResult {
  readonly stream: NodeJS.ReadableStream;
  readonly sizeBytes: number;
}

export interface StorageProvider {
  readonly driverName: string;
  put(input: StoragePutInput): Promise<StoragePutResult>;
  get(loc: StorageObjectLocation): Promise<StorageReadResult>;
  delete(loc: StorageObjectLocation): Promise<void>;
  /** Driver-formatted download URL (signed if applicable). May return null for drivers that stream only via the API. */
  buildDownloadUrl(loc: StorageObjectLocation, ttlSeconds: number): Promise<string | null>;
}
