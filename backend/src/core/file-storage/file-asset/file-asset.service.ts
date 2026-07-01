import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ConfigService } from '../../config';
import { NotFoundError } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { SubscriptionGuardService } from '../../subscription';
import {
  FILE_SIZE_LIMITS,
  STORAGE_PROVIDER,
} from '../file-storage.constants';
import {
  AssetNotPurgeableError,
  ScanNotCleanError,
  UploadTooLargeError,
} from '../file-storage.errors';
import type {
  FileAssetRow,
  FilePrincipalType,
  FilePurpose,
} from '../file-storage.types';
import { FileAclGrantRepository } from '../repositories/file-acl-grant.repository';
import { FileAssetRepository } from '../repositories/file-asset.repository';
import type { StorageProvider } from '../providers/storage-provider';

export interface UploadFileInput {
  readonly purpose: FilePurpose;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Buffer;
  readonly isPublic?: boolean;
  readonly expiresAt?: Date | null;
}

export interface ListFilesArgs {
  readonly purpose?: FilePurpose;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface GrantAclInput {
  readonly fileAssetId: string;
  readonly principalType: FilePrincipalType;
  readonly principalId: string | null;
}

@Injectable()
export class FileAssetService {
  private readonly logger = new Logger(FileAssetService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly assetRepo: FileAssetRepository,
    private readonly aclRepo: FileAclGrantRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly guard: SubscriptionGuardService,
  ) {}

  public async upload(input: UploadFileInput): Promise<FileAssetRow> {
    const ctx = RequestContextRegistry.require();
    const sizeBytes = input.body.byteLength;
    const cap = this.computeCap(input.purpose);
    if (sizeBytes > cap) {
      throw new UploadTooLargeError({
        sizeBytes,
        capBytes: cap,
        purpose: input.purpose,
      });
    }

    const schoolId = ctx.schoolId ?? null;
    if (schoolId !== null) {
      await this.guard.assertAndConsume(schoolId, 'storage_bytes', sizeBytes, 'file:pending');
    }

    let put: Awaited<ReturnType<StorageProvider['put']>>;
    try {
      put = await this.storage.put({
        schoolId,
        purpose: input.purpose,
        fileName: input.fileName,
        mimeType: input.mimeType,
        body: input.body,
      });
    } catch (err) {
      if (schoolId !== null) {
        await this.guard
          .releaseUsage(schoolId, 'storage_bytes', sizeBytes, 'file:upload-failed')
          .catch((e) => this.logger.error(`Compensating release failed: ${String(e)}`));
      }
      throw err;
    }

    // Local provider has no real scanner — mark CLEAN. Real ClamAV is Sprint 6.
    const scanStatus = this.storage.driverName === 'local' ? 'CLEAN' : 'PENDING';

    try {
      return await this.assetRepo.create({
        id: randomUUID(),
        schoolId,
        purpose: input.purpose,
        bucket: put.bucket,
        storageKey: put.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: put.sizeBytes,
        checksumSha256: put.checksumSha256,
        isPublic: input.isPublic ?? false,
        scanStatus,
        scanCompletedAt: scanStatus === 'CLEAN' ? new Date() : null,
        ownerUserId: ctx.userId ?? null,
        expiresAt: input.expiresAt ?? null,
        createdBy: ctx.userId ?? null,
      });
    } catch (err) {
      if (schoolId !== null) {
        await this.guard
          .releaseUsage(schoolId, 'storage_bytes', sizeBytes, 'file:row-failed')
          .catch((e) => this.logger.error(`Compensating release failed: ${String(e)}`));
      }
      await this.storage
        .delete({ bucket: put.bucket, storageKey: put.storageKey })
        .catch((e) => this.logger.error(`Compensating storage delete failed: ${String(e)}`));
      throw err;
    }
  }

  public async getById(id: string): Promise<FileAssetRow> {
    const row = await this.assetRepo.findById(id);
    if (row === null || row.deletedAt !== null) {
      throw new NotFoundError('FileAsset', id);
    }
    return row;
  }

  public async list(args: ListFilesArgs): Promise<{ items: FileAssetRow[]; nextCursor: string | null }> {
    const ctx = RequestContextRegistry.require();
    const limit = Math.min(args.limit ?? 50, 200);
    const cursor = args.cursor === undefined ? undefined : decodeCursor(args.cursor);
    const rows = await this.assetRepo.list({
      schoolId: ctx.schoolId ?? null,
      ...(args.purpose !== undefined ? { purpose: args.purpose } : {}),
      limit,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const visible = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit
        ? encodeCursor({
            createdAt: visible[visible.length - 1]!.createdAt,
            id: visible[visible.length - 1]!.id,
          })
        : null;
    return { items: [...visible], nextCursor };
  }

  public async buildDownloadUrl(id: string): Promise<{ url: string; expiresInSeconds: number }> {
    const row = await this.getById(id);
    this.assertDownloadable(row);
    const ttl = this.config.storage.downloadUrlTtlSeconds;
    const providerUrl = await this.storage.buildDownloadUrl(
      { bucket: row.bucket, storageKey: row.storageKey },
      ttl,
    );
    if (providerUrl !== null) {
      return { url: providerUrl, expiresInSeconds: ttl };
    }
    const base =
      this.config.storage.publicBaseUrl ??
      `${this.config.app.baseUrl}/${this.config.app.globalPrefix}/${this.config.app.apiVersion}`;
    return {
      url: `${base.replace(/\/$/, '')}/uploads/${row.id}/download`,
      expiresInSeconds: ttl,
    };
  }

  public async streamForDownload(id: string): Promise<{ row: FileAssetRow; stream: NodeJS.ReadableStream }> {
    const row = await this.getById(id);
    this.assertDownloadable(row);
    const result = await this.storage.get({ bucket: row.bucket, storageKey: row.storageKey });
    return { row, stream: result.stream };
  }

  public async softDelete(id: string): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const row = await this.assetRepo.findById(id);
    if (row === null) {
      throw new NotFoundError('FileAsset', id);
    }
    if (row.deletedAt !== null) {
      return;
    }
    await this.assetRepo.softDelete(id, ctx.userId ?? null);
    if (row.schoolId !== null) {
      await this.guard.releaseUsage(
        row.schoolId,
        'storage_bytes',
        Number(row.sizeBytes),
        `file:${id}`,
      );
    }
  }

  public async purge(id: string): Promise<void> {
    const row = await this.assetRepo.findById(id);
    if (row === null) {
      throw new NotFoundError('FileAsset', id);
    }
    if (row.deletedAt === null) {
      throw new AssetNotPurgeableError(id);
    }
    await this.storage.delete({ bucket: row.bucket, storageKey: row.storageKey });
    await this.assetRepo.purge(id);
  }

  public async listAcl(fileAssetId: string) {
    await this.getById(fileAssetId);
    return this.aclRepo.listForAsset(fileAssetId);
  }

  public async grantAcl(input: GrantAclInput) {
    const ctx = RequestContextRegistry.require();
    const asset = await this.getById(input.fileAssetId);
    return this.aclRepo.create({
      id: randomUUID(),
      fileAssetId: input.fileAssetId,
      schoolId: asset.schoolId,
      principalType: input.principalType,
      principalId: input.principalType === 'PUBLIC' ? null : input.principalId,
      grantedBy: ctx.userId ?? null,
    });
  }

  public async revokeAcl(fileAssetId: string, grantId: string) {
    const ctx = RequestContextRegistry.require();
    await this.getById(fileAssetId);
    const count = await this.aclRepo.revoke(grantId, ctx.userId ?? null);
    if (count === 0) {
      throw new NotFoundError('FileAssetAclGrant', grantId);
    }
  }

  private assertDownloadable(row: FileAssetRow): void {
    if (row.scanStatus === 'CLEAN') return;
    if (row.scanStatus === 'INFECTED' || row.scanStatus === 'SCAN_FAILED' || row.scanStatus === 'PENDING') {
      throw new ScanNotCleanError({ fileAssetId: row.id, scanStatus: row.scanStatus });
    }
  }

  private computeCap(purpose: FilePurpose): number {
    const perPurpose = (FILE_SIZE_LIMITS as Record<string, number>)[purpose] ??
      this.config.storage.maxUploadBytes;
    return Math.min(perPurpose, this.config.storage.maxUploadBytes);
  }
}

function encodeCursor(c: { createdAt: Date; id: string }): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const [iso, id] = decoded.split('|');
  if (iso === undefined || id === undefined) {
    throw new Error('Invalid cursor');
  }
  return { createdAt: new Date(iso), id };
}
