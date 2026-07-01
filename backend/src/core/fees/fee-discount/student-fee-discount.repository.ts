/**
 * StudentFeeDiscountRepository — persistence for `student_fee_discounts`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StudentFeeDiscountRow } from '../fees.types';

export interface CreateStudentFeeDiscountInput {
  readonly studentId: string;
  readonly feeDiscountId: string;
  readonly academicYearId: string;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
  readonly reason?: string | null;
}

export interface ListStudentFeeDiscountArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly studentId?: string;
  readonly academicYearId?: string;
  readonly feeDiscountId?: string;
  readonly approvedOnly?: boolean;
}

@Injectable()
export class StudentFeeDiscountRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StudentFeeDiscountRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<StudentFeeDiscountRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.studentFeeDiscount.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListStudentFeeDiscountArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly StudentFeeDiscountRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.academicYearId !== undefined) {
      where.academicYearId = args.academicYearId;
    }
    if (args.feeDiscountId !== undefined) {
      where.feeDiscountId = args.feeDiscountId;
    }
    if (args.approvedOnly === true) {
      where.approvedAt = { not: null };
    }
    const rows = await reader.studentFeeDiscount.findMany({
      where,
      orderBy: [{ id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateStudentFeeDiscountInput,
    tx?: PrismaTx,
  ): Promise<StudentFeeDiscountRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.studentFeeDiscount.create({
      data: {
        schoolId,
        studentId: input.studentId,
        feeDiscountId: input.feeDiscountId,
        academicYearId: input.academicYearId,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        reason: input.reason ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async approve(
    id: string,
    expectedVersion: number,
    approvedBy: string | null,
    tx?: PrismaTx,
  ): Promise<StudentFeeDiscountRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.studentFeeDiscount.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        approvedAt: new Date(),
        approvedBy,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('StudentFeeDiscount', id, expectedVersion);
    }
    const reloaded = await writer.studentFeeDiscount.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('StudentFeeDiscount', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.studentFeeDiscount.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('StudentFeeDiscount', id, expectedVersion);
    }
  }

  public async findActiveForStudent(
    studentId: string,
    academicYearId: string,
    onDate: Date,
    tx?: PrismaTx,
  ): Promise<readonly StudentFeeDiscountRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.studentFeeDiscount.findMany({
      where: {
        schoolId,
        studentId,
        academicYearId,
        deletedAt: null,
        validFrom: { lte: onDate },
        OR: [{ validTo: null }, { validTo: { gte: onDate } }],
      },
    });
    return rows.map(mapRow);
  }
}

interface RawStudentFeeDiscount {
  id: string;
  schoolId: string;
  studentId: string;
  feeDiscountId: string;
  academicYearId: string;
  validFrom: Date;
  validTo: Date | null;
  reason: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawStudentFeeDiscount): StudentFeeDiscountRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    feeDiscountId: row.feeDiscountId,
    academicYearId: row.academicYearId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
