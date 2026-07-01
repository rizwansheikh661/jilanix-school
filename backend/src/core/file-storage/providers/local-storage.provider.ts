import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  createReadStream,
  promises as fsp,
  type ReadStream,
} from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { ulid } from 'ulid';

import { ConfigService } from '../../config';
import {
  DriverMisconfiguredError,
  StorageReadFailedError,
  StorageWriteFailedError,
} from '../file-storage.errors';
import type {
  StorageObjectLocation,
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
  StorageReadResult,
} from '../file-storage.types';

/**
 * LocalStorageProvider — writes uploads under `${STORAGE_LOCAL_ROOT}` on the
 * server filesystem. Suitable for development, single-node deployments, and
 * unit tests. Path layout mirrors the s3-compatible layout so swapping
 * drivers later doesn't require a migration:
 *
 *   {root}/{bucket}/tenants/{schoolId}/{purpose}/{ulid}-{filename}
 *   {root}/{bucket}/platform/{purpose}/{ulid}-{filename}
 *
 * The default bucket is `default`; future drivers may pick per-environment
 * bucket names. Bucket is captured on the row so reads always know which
 * subtree to scan.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  public readonly driverName = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly defaultBucket = 'default';
  private readonly root: string;

  constructor(config: ConfigService) {
    const root = config.storage.localRoot;
    if (root.trim().length === 0) {
      throw new DriverMisconfiguredError('local', ['STORAGE_LOCAL_ROOT']);
    }
    this.root = resolve(process.cwd(), root);
  }

  public async put(input: StoragePutInput): Promise<StoragePutResult> {
    const safeName = sanitizeFileName(input.fileName);
    const key = buildStorageKey(input.schoolId, input.purpose, safeName);
    const fullPath = this.resolveSafe(this.defaultBucket, key);
    await fsp.mkdir(dirname(fullPath), { recursive: true });

    const buffer = await collectBuffer(input.body);
    try {
      await fsp.writeFile(fullPath, buffer, { mode: 0o640 });
    } catch (err) {
      throw new StorageWriteFailedError(this.driverName, (err as Error).message, err);
    }
    const checksum = createHash('sha256').update(buffer).digest('hex');
    return {
      bucket: this.defaultBucket,
      storageKey: key,
      sizeBytes: buffer.byteLength,
      checksumSha256: checksum,
    };
  }

  public async get(loc: StorageObjectLocation): Promise<StorageReadResult> {
    const fullPath = this.resolveSafe(loc.bucket, loc.storageKey);
    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch (err) {
      throw new StorageReadFailedError(this.driverName, (err as Error).message, err);
    }
    const stream: ReadStream = createReadStream(fullPath);
    return { stream, sizeBytes: stat.size };
  }

  public async delete(loc: StorageObjectLocation): Promise<void> {
    const fullPath = this.resolveSafe(loc.bucket, loc.storageKey);
    try {
      await fsp.rm(fullPath, { force: true });
    } catch (err) {
      this.logger.warn(`local-storage delete soft-failed: ${(err as Error).message}`);
    }
  }

  public async buildDownloadUrl(): Promise<string | null> {
    // Local driver streams via the API (`GET /uploads/:id/download`). The
    // service layer formats the URL; we just signal we have no presigned
    // path of our own.
    return null;
  }

  private resolveSafe(bucket: string, key: string): string {
    const normalised = normalize(key);
    if (normalised.split(sep).some((segment) => segment === '..')) {
      throw new StorageReadFailedError(this.driverName, `Illegal storage key "${key}"`);
    }
    return join(this.root, bucket, normalised);
  }
}

function buildStorageKey(
  schoolId: string | null,
  purpose: string,
  safeName: string,
): string {
  const id = ulid().toLowerCase();
  const prefix = schoolId === null ? `platform/${purpose}` : `tenants/${schoolId}/${purpose}`;
  return `${prefix}/${id}-${safeName}`;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return trimmed.length === 0 ? 'unnamed' : trimmed.slice(0, 200);
}

async function collectBuffer(body: Buffer | NodeJS.ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  const chunks: Buffer[] = [];
  const readable = body instanceof Readable ? body : Readable.from(body as NodeJS.ReadableStream);
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}
