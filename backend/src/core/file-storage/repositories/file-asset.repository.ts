import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type {
  FileAssetRow,
  FilePurpose,
  FileScanStatus,
} from '../file-storage.types';

export interface CreateFileAssetInput {
  readonly id: string;
  readonly schoolId: string | null;
  readonly purpose: FilePurpose;
  readonly bucket: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly isPublic: boolean;
  readonly scanStatus: FileScanStatus;
  readonly scanCompletedAt: Date | null;
  readonly ownerUserId: string | null;
  readonly expiresAt: Date | null;
  readonly createdBy: string | null;
}

export interface ListFileAssetsArgs {
  readonly schoolId: string | null;
  readonly purpose?: FilePurpose;
  readonly limit: number;
  readonly cursor?: { createdAt: Date; id: string };
}

@Injectable()
export class FileAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateFileAssetInput, tx?: PrismaTx): Promise<FileAssetRow> {
    const writer = this.reader(tx);
    const row = await writer.fileAsset.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        purpose: input.purpose,
        bucket: input.bucket,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        checksumSha256: input.checksumSha256,
        isPublic: input.isPublic,
        scanStatus: input.scanStatus,
        scanCompletedAt: input.scanCompletedAt,
        ownerUserId: input.ownerUserId,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<FileAssetRow | null> {
    const reader = this.reader(tx);
    const row = await reader.fileAsset.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListFileAssetsArgs): Promise<readonly FileAssetRow[]> {
    const reader = this.reader();
    const where: Prisma.FileAssetWhereInput = {
      schoolId: args.schoolId,
    };
    if (args.purpose !== undefined) {
      where.purpose = args.purpose;
    }
    if (args.cursor !== undefined) {
      where.OR = [
        { createdAt: { lt: args.cursor.createdAt } },
        { createdAt: args.cursor.createdAt, id: { lt: args.cursor.id } },
      ];
    }
    const rows = await reader.fileAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.limit + 1,
    });
    return rows.map(mapRow);
  }

  public async updateScanStatus(
    id: string,
    expectedVersion: number,
    args: { scanStatus: FileScanStatus; scanCompletedAt: Date | null; updatedBy: string | null },
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.reader(tx);
    const result = await writer.fileAsset.updateMany({
      where: { id, version: expectedVersion },
      data: {
        scanStatus: args.scanStatus,
        scanCompletedAt: args.scanCompletedAt,
        updatedBy: args.updatedBy,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  public async softDelete(id: string, deletedBy: string | null, tx?: PrismaTx): Promise<number> {
    const writer = this.reader(tx);
    const result = await writer.fileAsset.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy,
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  /** Hard-delete — used by the cleanup job after grace window. */
  public async purge(id: string, tx?: PrismaTx): Promise<number> {
    const writer = this.reader(tx);
    const result = await writer.fileAsset.deleteMany({ where: { id } });
    return result.count;
  }
}

interface RawFileAsset {
  id: string;
  schoolId: string | null;
  purpose: FilePurpose;
  bucket: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksumSha256: string;
  isPublic: boolean;
  scanStatus: FileScanStatus;
  scanCompletedAt: Date | null;
  ownerUserId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawFileAsset): FileAssetRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    purpose: row.purpose,
    bucket: row.bucket,
    storageKey: row.storageKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    isPublic: row.isPublic,
    scanStatus: row.scanStatus,
    scanCompletedAt: row.scanCompletedAt,
    ownerUserId: row.ownerUserId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
