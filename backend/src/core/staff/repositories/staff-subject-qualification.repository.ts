/**
 * StaffSubjectQualificationRepository — M:N staff ↔ subject. Idempotent
 * replace-set semantics: `replaceForStaff` deletes the entire set then
 * recreates from input. Service validates subject existence beforehand.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StaffSubjectQualificationRow } from '../staff.types';

export interface SubjectQualificationInput {
  readonly subjectId: string;
  readonly proficiency?: string | null;
}

type Reader = PrismaTx;

@Injectable()
export class StaffSubjectQualificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByStaff(
    staffId: string,
    tx?: PrismaTx,
  ): Promise<readonly StaffSubjectQualificationRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.staffSubjectQualification.findMany({
      where: { schoolId, staffId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async replaceForStaff(
    staffId: string,
    inputs: readonly SubjectQualificationInput[],
    tx?: PrismaTx,
  ): Promise<readonly StaffSubjectQualificationRow[]> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    await writer.staffSubjectQualification.deleteMany({
      where: { schoolId, staffId },
    });
    if (inputs.length === 0) {
      return [];
    }
    await writer.staffSubjectQualification.createMany({
      data: inputs.map((i) => ({
        schoolId,
        staffId,
        subjectId: i.subjectId,
        proficiency: i.proficiency ?? null,
        createdBy: ctx.userId ?? null,
      })),
    });
    const rows = await writer.staffSubjectQualification.findMany({
      where: { schoolId, staffId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapRow);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'StaffSubjectQualificationRepository requires a tenant-scoped RequestContext.',
      );
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  subjectId: string;
  proficiency: string | null;
  createdAt: Date;
  createdBy: string | null;
}

function mapRow(row: RawRow): StaffSubjectQualificationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    subjectId: row.subjectId,
    proficiency: row.proficiency,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
