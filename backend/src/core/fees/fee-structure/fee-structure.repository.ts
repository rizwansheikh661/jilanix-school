/**
 * FeeStructureRepository — persistence for `fee_structures` (header) and
 * child `fee_structure_lines` rows.
 *
 * Both header and child lines are soft-deletable. Lines are replaced
 * wholesale on PATCH (DRAFT only) by soft-deleting the active set and
 * inserting a fresh set.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  FeeFrequencyValue,
  FeeStructureAppliesToValue,
  FeeStructureStatusValue,
} from '../fees.constants';
import type {
  FeeStructureLineRow,
  FeeStructureRow,
  FeeStructureWithLines,
} from '../fees.types';

export interface CreateFeeStructureLineInput {
  readonly feeHeadId: string;
  readonly lateFinePolicyId?: string | null;
  readonly amount: number;
  readonly frequency: FeeFrequencyValue;
  readonly dueDay?: number | null;
  readonly ordering: number;
}

export interface CreateFeeStructureInput {
  readonly academicYearId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly appliesTo: FeeStructureAppliesToValue;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly studentId: string | null;
  readonly currency: string;
  readonly description: string | null;
  readonly lines: readonly CreateFeeStructureLineInput[];
}

export interface UpdateFeeStructureHeaderInput {
  readonly branchId?: string | null;
  readonly name?: string;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly studentId?: string | null;
  readonly currency?: string;
  readonly description?: string | null;
}

export interface ListFeeStructureArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly studentId?: string;
  readonly status?: FeeStructureStatusValue;
  readonly branchId?: string;
}

@Injectable()
export class FeeStructureRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeStructureRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeStructureWithLines | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.feeStructure.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (header === null) return null;
    const lines = await reader.feeStructureLine.findMany({
      where: { schoolId, feeStructureId: id, deletedAt: null },
      orderBy: [{ ordering: 'asc' }],
    });
    return {
      ...mapHeader(header),
      lines: lines.map(mapLine),
    };
  }

  public async findActiveByName(
    academicYearId: string,
    name: string,
    tx?: PrismaTx,
  ): Promise<FeeStructureRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeStructure.findFirst({
      where: { schoolId, academicYearId, name, deletedAt: null },
    });
    return row === null ? null : mapHeader(row);
  }

  public async list(
    args: ListFeeStructureArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeStructureWithLines[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.classId !== undefined) where.classId = args.classId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.status !== undefined) where.status = args.status;
    if (args.branchId !== undefined) where.branchId = args.branchId;
    const headers = await reader.feeStructure.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    if (headers.length === 0) return { rows: [], nextCursorId };
    const ids = headers.map((h) => h.id);
    const lines = await reader.feeStructureLine.findMany({
      where: { schoolId, feeStructureId: { in: ids }, deletedAt: null },
      orderBy: [{ ordering: 'asc' }],
    });
    const byStructure = new Map<string, FeeStructureLineRow[]>();
    for (const l of lines) {
      const arr = byStructure.get(l.feeStructureId) ?? [];
      arr.push(mapLine(l));
      byStructure.set(l.feeStructureId, arr);
    }
    const rows = headers.map((h) => ({
      ...mapHeader(h),
      lines: byStructure.get(h.id) ?? [],
    }));
    return { rows, nextCursorId };
  }

  public async create(
    input: CreateFeeStructureInput,
    tx?: PrismaTx,
  ): Promise<FeeStructureWithLines> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const header = await writer.feeStructure.create({
      data: {
        schoolId,
        academicYearId: input.academicYearId,
        branchId: input.branchId,
        name: input.name,
        appliesTo: input.appliesTo,
        classId: input.classId,
        sectionId: input.sectionId,
        studentId: input.studentId,
        currency: input.currency,
        status: 'DRAFT',
        description: input.description,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    const lineRows: FeeStructureLineRow[] = [];
    for (const l of input.lines) {
      const created = await writer.feeStructureLine.create({
        data: {
          schoolId,
          feeStructureId: header.id,
          feeHeadId: l.feeHeadId,
          lateFinePolicyId: l.lateFinePolicyId ?? null,
          amount: l.amount,
          frequency: l.frequency,
          dueDay: l.dueDay ?? null,
          ordering: l.ordering,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      lineRows.push(mapLine(created));
    }
    return { ...mapHeader(header), lines: lineRows };
  }

  public async updateHeader(
    id: string,
    expectedVersion: number,
    input: UpdateFeeStructureHeaderInput,
    tx?: PrismaTx,
  ): Promise<FeeStructureRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.branchId !== undefined) data.branchId = input.branchId;
    if (input.name !== undefined) data.name = input.name;
    if (input.classId !== undefined) data.classId = input.classId;
    if (input.sectionId !== undefined) data.sectionId = input.sectionId;
    if (input.studentId !== undefined) data.studentId = input.studentId;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.description !== undefined) data.description = input.description;
    const result = await writer.feeStructure.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeStructure', id, expectedVersion);
    }
    const reloaded = await writer.feeStructure.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeStructure', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async replaceLines(
    structureId: string,
    lines: readonly CreateFeeStructureLineInput[],
    tx?: PrismaTx,
  ): Promise<readonly FeeStructureLineRow[]> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const now = new Date();
    await writer.feeStructureLine.updateMany({
      where: {
        schoolId,
        feeStructureId: structureId,
        deletedAt: null,
      },
      data: {
        deletedAt: now,
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    const out: FeeStructureLineRow[] = [];
    for (const l of lines) {
      const created = await writer.feeStructureLine.create({
        data: {
          schoolId,
          feeStructureId: structureId,
          feeHeadId: l.feeHeadId,
          lateFinePolicyId: l.lateFinePolicyId ?? null,
          amount: l.amount,
          frequency: l.frequency,
          dueDay: l.dueDay ?? null,
          ordering: l.ordering,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      out.push(mapLine(created));
    }
    return out;
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: FeeStructureStatusValue,
    timestamps: { publishedAt?: Date; archivedAt?: Date },
    tx?: PrismaTx,
  ): Promise<FeeStructureRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (timestamps.publishedAt !== undefined) data.publishedAt = timestamps.publishedAt;
    if (timestamps.archivedAt !== undefined) data.archivedAt = timestamps.archivedAt;
    const result = await writer.feeStructure.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeStructure', id, expectedVersion);
    }
    const reloaded = await writer.feeStructure.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeStructure', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.feeStructure.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeStructure', id, expectedVersion);
    }
  }
}

interface RawHeader {
  id: string;
  schoolId: string;
  academicYearId: string;
  branchId: string | null;
  name: string;
  appliesTo: string;
  classId: string | null;
  sectionId: string | null;
  studentId: string | null;
  currency: string;
  status: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawLine {
  id: string;
  schoolId: string;
  feeStructureId: string;
  feeHeadId: string;
  lateFinePolicyId: string | null;
  amount: unknown;
  frequency: string;
  dueDay: number | null;
  ordering: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapHeader(row: RawHeader): FeeStructureRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    branchId: row.branchId,
    name: row.name,
    appliesTo: row.appliesTo as FeeStructureAppliesToValue,
    classId: row.classId,
    sectionId: row.sectionId,
    studentId: row.studentId,
    currency: row.currency,
    status: row.status as FeeStructureStatusValue,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapLine(row: RawLine): FeeStructureLineRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    feeStructureId: row.feeStructureId,
    feeHeadId: row.feeHeadId,
    lateFinePolicyId: row.lateFinePolicyId,
    amount: toNumber(row.amount),
    frequency: row.frequency as FeeFrequencyValue,
    dueDay: row.dueDay,
    ordering: row.ordering,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

export const __test__ = { toNumber };
