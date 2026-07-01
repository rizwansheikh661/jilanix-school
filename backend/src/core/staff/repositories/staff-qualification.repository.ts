/**
 * StaffQualificationRepository — read/write access to the
 * `staff_qualifications` table. 1:N child of Staff; cascade-deletes
 * with parent. No version / soft-delete on this row.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StaffQualificationRow } from '../staff.types';

export interface CreateStaffQualificationInput {
  readonly staffId: string;
  readonly qualificationType: string;
  readonly name: string;
  readonly institution?: string | null;
  readonly yearAwarded?: number | null;
  readonly gradeOrScore?: string | null;
}

type Reader = PrismaTx;

@Injectable()
export class StaffQualificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<StaffQualificationRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staffQualification.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByStaff(
    staffId: string,
    tx?: PrismaTx,
  ): Promise<readonly StaffQualificationRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.staffQualification.findMany({
      where: { schoolId, staffId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(
    input: CreateStaffQualificationInput,
    tx?: PrismaTx,
  ): Promise<StaffQualificationRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.staffQualification.create({
      data: {
        schoolId,
        staffId: input.staffId,
        qualificationType: input.qualificationType,
        name: input.name,
        institution: input.institution ?? null,
        yearAwarded: input.yearAwarded ?? null,
        gradeOrScore: input.gradeOrScore ?? null,
        createdBy: ctx.userId ?? null,
      },
    });
    return mapRow(row);
  }

  public async delete(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    await writer.staffQualification.delete({
      where: { schoolId_id: { schoolId, id } },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StaffQualificationRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  qualificationType: string;
  name: string;
  institution: string | null;
  yearAwarded: number | null;
  gradeOrScore: string | null;
  createdAt: Date;
  createdBy: string | null;
}

function mapRow(row: RawRow): StaffQualificationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    qualificationType: row.qualificationType,
    name: row.name,
    institution: row.institution,
    yearAwarded: row.yearAwarded,
    gradeOrScore: row.gradeOrScore,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
