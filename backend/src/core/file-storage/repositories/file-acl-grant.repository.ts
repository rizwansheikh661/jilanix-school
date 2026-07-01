import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { FileAssetAclGrantRow, FilePrincipalType } from '../file-storage.types';

export interface CreateAclGrantInput {
  readonly id: string;
  readonly fileAssetId: string;
  readonly schoolId: string | null;
  readonly principalType: FilePrincipalType;
  readonly principalId: string | null;
  readonly grantedBy: string | null;
}

@Injectable()
export class FileAclGrantRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateAclGrantInput, tx?: PrismaTx): Promise<FileAssetAclGrantRow> {
    const writer = this.reader(tx);
    const row = await writer.fileAssetAclGrant.create({
      data: {
        id: input.id,
        fileAssetId: input.fileAssetId,
        schoolId: input.schoolId,
        principalType: input.principalType,
        principalId: input.principalId,
        grantedBy: input.grantedBy,
      },
    });
    return mapRow(row);
  }

  public async listForAsset(fileAssetId: string, includeRevoked = false): Promise<readonly FileAssetAclGrantRow[]> {
    const reader = this.reader();
    const rows = await reader.fileAssetAclGrant.findMany({
      where: includeRevoked
        ? { fileAssetId }
        : { fileAssetId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
    return rows.map(mapRow);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<FileAssetAclGrantRow | null> {
    const reader = this.reader(tx);
    const row = await reader.fileAssetAclGrant.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async revoke(id: string, revokedBy: string | null, tx?: PrismaTx): Promise<number> {
    const writer = this.reader(tx);
    const result = await writer.fileAssetAclGrant.updateMany({
      where: { id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedBy,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  public async findActiveForPrincipal(
    fileAssetId: string,
    principalType: FilePrincipalType,
    principalId: string | null,
  ): Promise<FileAssetAclGrantRow | null> {
    const reader = this.reader();
    const row = await reader.fileAssetAclGrant.findFirst({
      where: { fileAssetId, principalType, principalId, revokedAt: null },
    });
    return row === null ? null : mapRow(row);
  }
}

interface RawAclGrant {
  id: string;
  fileAssetId: string;
  schoolId: string | null;
  principalType: FilePrincipalType;
  principalId: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  grantedBy: string | null;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(row: RawAclGrant): FileAssetAclGrantRow {
  return {
    id: row.id,
    fileAssetId: row.fileAssetId,
    schoolId: row.schoolId,
    principalType: row.principalType,
    principalId: row.principalId,
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt,
    grantedBy: row.grantedBy,
    revokedBy: row.revokedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
