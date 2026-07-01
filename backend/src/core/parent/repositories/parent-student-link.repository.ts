/**
 * ParentStudentLinkRepository — read/write access to the
 * `parent_student_links` join table.
 *
 * Each row represents one slot (FATHER/MOTHER/GUARDIAN) on a Parent
 * row pointing at a Student row. The unique
 * `uq_pslink_parent_student_relation` prevents duplicate slot-claims;
 * the service enforces the per-student "≤ 3 parents" cap and
 * "exactly one primary contact" invariant.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ParentRelationValue, ParentStudentLinkRow } from '../parent.types';

export interface CreateLinkInput {
  readonly parentId: string;
  readonly studentId: string;
  readonly relation: ParentRelationValue;
  readonly isPrimaryContact?: boolean;
  readonly canPickup?: boolean;
}

type Reader = PrismaTx;

@Injectable()
export class ParentStudentLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<ParentStudentLinkRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.parentStudentLink.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findExisting(
    args: { readonly parentId: string; readonly studentId: string; readonly relation: ParentRelationValue },
    tx?: PrismaTx,
  ): Promise<ParentStudentLinkRow | null> {
    const reader = this.reader(tx);
    const row = await reader.parentStudentLink.findFirst({
      where: {
        parentId: args.parentId,
        studentId: args.studentId,
        relation: args.relation,
      },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByStudent(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<readonly ParentStudentLinkRow[]> {
    const reader = this.reader(tx);
    const rows = await reader.parentStudentLink.findMany({
      where: { studentId },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async findByParent(
    parentId: string,
    tx?: PrismaTx,
  ): Promise<readonly ParentStudentLinkRow[]> {
    const reader = this.reader(tx);
    const rows = await reader.parentStudentLink.findMany({
      where: { parentId },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async countActiveLinksForParent(parentId: string, tx?: PrismaTx): Promise<number> {
    const reader = this.reader(tx);
    return reader.parentStudentLink.count({
      where: {
        parentId,
        student: { deletedAt: null },
      },
    });
  }

  public async create(input: CreateLinkInput, tx?: PrismaTx): Promise<ParentStudentLinkRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.parentStudentLink.create({
      data: {
        schoolId,
        parentId: input.parentId,
        studentId: input.studentId,
        relation: input.relation,
        isPrimaryContact: input.isPrimaryContact ?? false,
        canPickup: input.canPickup ?? true,
      },
    });
    return mapRow(row);
  }

  /**
   * Demote any existing primary contact for `studentId` to false.
   * Caller is responsible for then promoting the new link. Run inside a
   * transaction so the two writes are atomic.
   */
  public async demotePrimaryContact(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.reader(tx);
    await writer.parentStudentLink.updateMany({
      where: { studentId, isPrimaryContact: true },
      data: { isPrimaryContact: false },
    });
  }

  public async delete(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    await writer.parentStudentLink.delete({
      where: { schoolId_id: { schoolId, id } },
    });
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ParentStudentLinkRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawLink {
  id: string;
  schoolId: string;
  parentId: string;
  studentId: string;
  relation: string;
  isPrimaryContact: boolean;
  canPickup: boolean;
  createdAt: Date;
  createdBy: string | null;
}

function mapRow(row: RawLink): ParentStudentLinkRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    parentId: row.parentId,
    studentId: row.studentId,
    relation: row.relation as ParentRelationValue,
    isPrimaryContact: row.isPrimaryContact,
    canPickup: row.canPickup,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}
