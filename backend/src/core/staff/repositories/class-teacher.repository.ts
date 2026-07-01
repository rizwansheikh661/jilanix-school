/**
 * ClassTeacherRepository — read/write access to `class_teachers` (the
 * homeroom-teacher assignment). MySQL has no partial unique index, so
 * the "one active row per (section, year)" constraint is enforced in
 * the service via `findActiveForSection` before insert.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ClassTeacherRow } from '../staff.types';

export interface CreateClassTeacherInput {
  readonly staffId: string;
  readonly sectionId: string;
  readonly academicYearId: string;
  readonly assignedOn: Date;
}

export interface ListClassTeacherArgs {
  readonly academicYearId?: string;
  readonly sectionId?: string;
  readonly staffId?: string;
  readonly activeOnly?: boolean;
}

type Reader = PrismaTx;

@Injectable()
export class ClassTeacherRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<ClassTeacherRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.classTeacher.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  /** Find the currently active (non-revoked) row for `(sectionId, year)`. */
  public async findActiveForSection(
    sectionId: string,
    academicYearId: string,
    tx?: PrismaTx,
  ): Promise<ClassTeacherRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.classTeacher.findFirst({
      where: { schoolId, sectionId, academicYearId, revokedOn: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListClassTeacherArgs,
    tx?: PrismaTx,
  ): Promise<readonly ClassTeacherRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const where: Record<string, unknown> = { schoolId };
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.staffId !== undefined) where.staffId = args.staffId;
    if (args.activeOnly === true) where.revokedOn = null;
    const rows = await reader.classTeacher.findMany({
      where,
      orderBy: [{ assignedOn: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(input: CreateClassTeacherInput, tx?: PrismaTx): Promise<ClassTeacherRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.classTeacher.create({
      data: {
        schoolId,
        staffId: input.staffId,
        sectionId: input.sectionId,
        academicYearId: input.academicYearId,
        assignedOn: input.assignedOn,
      },
    });
    return mapRow(row);
  }

  public async revoke(
    id: string,
    expectedVersion: number,
    revokedOn: Date,
    tx?: PrismaTx,
  ): Promise<ClassTeacherRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.classTeacher.updateMany({
      where: { schoolId, id, version: expectedVersion, revokedOn: null },
      data: { revokedOn, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ClassTeacher', id, expectedVersion);
    }
    const row = await writer.classTeacher.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('ClassTeacher', id, expectedVersion);
    }
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ClassTeacherRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  sectionId: string;
  academicYearId: string;
  assignedOn: Date;
  revokedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawRow): ClassTeacherRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    sectionId: row.sectionId,
    academicYearId: row.academicYearId,
    assignedOn: row.assignedOn,
    revokedOn: row.revokedOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
