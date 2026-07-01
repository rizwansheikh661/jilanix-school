/**
 * StaffDocumentRepository — metadata-only document records attached to
 * a Staff row. Storage URL is opaque (file upload pipeline ships
 * later). Cascade-deletes with parent Staff row.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StaffDocumentRow } from '../staff.types';

export interface CreateStaffDocumentInput {
  readonly staffId: string;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
}

type Reader = PrismaTx;

@Injectable()
export class StaffDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<StaffDocumentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staffDocument.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByStaff(
    staffId: string,
    tx?: PrismaTx,
  ): Promise<readonly StaffDocumentRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.staffDocument.findMany({
      where: { schoolId, staffId },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(input: CreateStaffDocumentInput, tx?: PrismaTx): Promise<StaffDocumentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.staffDocument.create({
      data: {
        schoolId,
        staffId: input.staffId,
        label: input.label,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageUrl: input.storageUrl,
        uploadedBy: ctx.userId ?? null,
        uploadedAt: new Date(),
      },
    });
    return mapRow(row);
  }

  public async delete(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    await writer.staffDocument.delete({
      where: { schoolId_id: { schoolId, id } },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StaffDocumentRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  uploadedBy: string | null;
  uploadedAt: Date;
}

function mapRow(row: RawRow): StaffDocumentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageUrl: row.storageUrl,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
}
