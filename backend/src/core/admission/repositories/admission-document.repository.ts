/**
 * AdmissionDocumentRepository — read/write access to
 * `admission_documents`. Metadata only — `storageUrl` is treated as an
 * opaque string (Sprint 3 ships no presigned-URL pipeline). Cascade
 * delete on the parent Admission row.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AdmissionDocumentRow } from '../admission.types';

export interface CreateAdmissionDocumentInput {
  readonly admissionId: string;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
}

type Reader = PrismaTx;

@Injectable()
export class AdmissionDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<AdmissionDocumentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.admissionDocument.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByAdmission(
    admissionId: string,
    tx?: PrismaTx,
  ): Promise<readonly AdmissionDocumentRow[]> {
    const reader = this.reader(tx);
    const rows = await reader.admissionDocument.findMany({
      where: { admissionId },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(
    input: CreateAdmissionDocumentInput,
    tx?: PrismaTx,
  ): Promise<AdmissionDocumentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.admissionDocument.create({
      data: {
        schoolId,
        admissionId: input.admissionId,
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
    await writer.admissionDocument.delete({
      where: { schoolId_id: { schoolId, id } },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AdmissionDocumentRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawDoc {
  id: string;
  schoolId: string;
  admissionId: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  uploadedBy: string | null;
  uploadedAt: Date;
}

function mapRow(row: RawDoc): AdmissionDocumentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    admissionId: row.admissionId,
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageUrl: row.storageUrl,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
}
