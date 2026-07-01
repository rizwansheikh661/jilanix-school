/**
 * StaffSectionAssignmentRepository — read/write access to
 * `staff_section_assignments`. Unique on
 * (school, year, section, subject, staff). Used as the seed table for
 * the Sprint 12 timetable build.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StaffSectionAssignmentRow } from '../staff.types';

export interface CreateSectionAssignmentInput {
  readonly staffId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly academicYearId: string;
  readonly periodsPerWeek?: number | null;
}

export interface ListSectionAssignmentArgs {
  readonly staffId?: string;
  readonly sectionId?: string;
  readonly subjectId?: string;
  readonly academicYearId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class StaffSectionAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<StaffSectionAssignmentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staffSectionAssignment.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findDuplicate(
    input: CreateSectionAssignmentInput,
    tx?: PrismaTx,
  ): Promise<StaffSectionAssignmentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staffSectionAssignment.findFirst({
      where: {
        schoolId,
        staffId: input.staffId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        academicYearId: input.academicYearId,
      },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListSectionAssignmentArgs,
    tx?: PrismaTx,
  ): Promise<readonly StaffSectionAssignmentRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const where: Record<string, unknown> = { schoolId };
    if (args.staffId !== undefined) where.staffId = args.staffId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.subjectId !== undefined) where.subjectId = args.subjectId;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    const rows = await reader.staffSectionAssignment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(
    input: CreateSectionAssignmentInput,
    tx?: PrismaTx,
  ): Promise<StaffSectionAssignmentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.staffSectionAssignment.create({
      data: {
        schoolId,
        staffId: input.staffId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        academicYearId: input.academicYearId,
        periodsPerWeek: input.periodsPerWeek ?? null,
        createdBy: ctx.userId ?? null,
      },
    });
    return mapRow(row);
  }

  public async delete(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    await writer.staffSectionAssignment.delete({
      where: { schoolId_id: { schoolId, id } },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'StaffSectionAssignmentRepository requires a tenant-scoped RequestContext.',
      );
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  periodsPerWeek: number | null;
  createdAt: Date;
  createdBy: string | null;
}

function mapRow(row: RawRow): StaffSectionAssignmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    academicYearId: row.academicYearId,
    periodsPerWeek: row.periodsPerWeek,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
