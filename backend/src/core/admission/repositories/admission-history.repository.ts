/**
 * AdmissionHistoryRepository — append-only state-transition log for
 * `admissions`. Every transition in `AdmissionService` writes one row
 * here inside the same transaction so the audit chain matches the
 * actual workflow state.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AdmissionHistoryRow, AdmissionStatusValue } from '../admission.types';

export interface AppendAdmissionHistoryInput {
  readonly admissionId: string;
  readonly fromStatus: AdmissionStatusValue | null;
  readonly toStatus: AdmissionStatusValue;
  readonly note?: string | null;
}

type Reader = PrismaTx;

@Injectable()
export class AdmissionHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByAdmission(
    admissionId: string,
    tx?: PrismaTx,
  ): Promise<readonly AdmissionHistoryRow[]> {
    const reader = this.reader(tx);
    const rows = await reader.admissionHistory.findMany({
      where: { admissionId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async append(
    input: AppendAdmissionHistoryInput,
    tx?: PrismaTx,
  ): Promise<AdmissionHistoryRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.admissionHistory.create({
      data: {
        schoolId,
        admissionId: input.admissionId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorId: ctx.userId ?? null,
        note: input.note ?? null,
        occurredAt: new Date(),
      },
    });
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AdmissionHistoryRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawHistory {
  id: string;
  schoolId: string;
  admissionId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  note: string | null;
  occurredAt: Date;
}

function mapRow(row: RawHistory): AdmissionHistoryRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    admissionId: row.admissionId,
    fromStatus: row.fromStatus === null ? null : (row.fromStatus as AdmissionStatusValue),
    toStatus: row.toStatus as AdmissionStatusValue,
    actorId: row.actorId,
    note: row.note,
    occurredAt: row.occurredAt,
  };
}
