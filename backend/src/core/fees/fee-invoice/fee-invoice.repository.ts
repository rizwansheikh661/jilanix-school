/**
 * FeeInvoiceRepository — persistence for `fee_invoices` (header) and child
 * `fee_invoice_lines` rows.
 *
 * Both header and child lines are soft-deletable. On recompute the service
 * replaces all non-fine lines wholesale; the late-fine line (when present)
 * is added incrementally via `addLine`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeeInvoiceStatusValue } from '../fees.constants';
import type { FeeInvoiceLineRow, FeeInvoiceRow } from '../fees.types';

export interface CreateFeeInvoiceLineInput {
  readonly feeHeadId: string;
  readonly sourceFinePolicyId?: string | null;
  readonly sourceDiscountId?: string | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly discountAmount: number;
  readonly taxAmount: number;
  readonly lineTotal: number;
  readonly isLateFine: boolean;
}

export interface CreateFeeInvoiceInput {
  readonly studentId: string;
  readonly feeStructureId: string;
  readonly academicYearId: string;
  readonly branchId: string | null;
  readonly invoiceNo: string;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly notes?: string | null;
  readonly lines: readonly CreateFeeInvoiceLineInput[];
}

export interface UpdateFeeInvoiceTotalsInput {
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  /** Status to set alongside totals (e.g. DRAFT -> SENT on recompute). */
  readonly status?: FeeInvoiceStatusValue;
}

export interface ListFeeInvoiceArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly studentId?: string;
  readonly academicYearId?: string;
  readonly status?: FeeInvoiceStatusValue;
  readonly periodFrom?: Date;
  readonly periodTo?: Date;
}

export interface FeeInvoiceWithLinesRaw {
  readonly header: FeeInvoiceRow;
  readonly lines: readonly FeeInvoiceLineRow[];
}

@Injectable()
export class FeeInvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeInvoiceRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceWithLinesRaw | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.feeInvoice.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (header === null) return null;
    const lines = await reader.feeInvoiceLine.findMany({
      where: { schoolId, feeInvoiceId: id, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      header: mapHeader(header),
      lines: lines.map(mapLine),
    };
  }

  public async findActiveForStudentPeriod(
    studentId: string,
    feeStructureId: string,
    periodFrom: Date,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feeInvoice.findFirst({
      where: {
        schoolId,
        studentId,
        feeStructureId,
        periodFrom,
        deletedAt: null,
        status: { not: 'VOID' },
      },
    });
    return row === null ? null : mapHeader(row);
  }

  public async list(
    args: ListFeeInvoiceArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeeInvoiceWithLinesRaw[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.academicYearId !== undefined) {
      where.academicYearId = args.academicYearId;
    }
    if (args.status !== undefined) where.status = args.status;
    if (args.periodFrom !== undefined || args.periodTo !== undefined) {
      const periodFilter: Record<string, unknown> = {};
      if (args.periodFrom !== undefined) periodFilter.gte = args.periodFrom;
      if (args.periodTo !== undefined) periodFilter.lte = args.periodTo;
      where.periodFrom = periodFilter;
    }
    const headers = await reader.feeInvoice.findMany({
      where,
      orderBy: [{ periodFrom: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    if (headers.length === 0) return { rows: [], nextCursorId };
    const ids = headers.map((h) => h.id);
    const lines = await reader.feeInvoiceLine.findMany({
      where: { schoolId, feeInvoiceId: { in: ids }, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byInvoice = new Map<string, FeeInvoiceLineRow[]>();
    for (const l of lines) {
      const arr = byInvoice.get(l.feeInvoiceId) ?? [];
      arr.push(mapLine(l));
      byInvoice.set(l.feeInvoiceId, arr);
    }
    const rows: FeeInvoiceWithLinesRaw[] = headers.map((h) => ({
      header: mapHeader(h),
      lines: byInvoice.get(h.id) ?? [],
    }));
    return { rows, nextCursorId };
  }

  public async create(
    input: CreateFeeInvoiceInput,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceWithLinesRaw> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const balanceTotal = input.total;
    const header = await writer.feeInvoice.create({
      data: {
        schoolId,
        studentId: input.studentId,
        feeStructureId: input.feeStructureId,
        academicYearId: input.academicYearId,
        branchId: input.branchId,
        invoiceNo: input.invoiceNo,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotal: input.subtotal,
        discountTotal: input.discountTotal,
        taxTotal: input.taxTotal,
        total: input.total,
        paidTotal: 0,
        refundTotal: 0,
        balanceTotal,
        status: 'DRAFT',
        notes: input.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    const lineRows: FeeInvoiceLineRow[] = [];
    for (const l of input.lines) {
      const created = await writer.feeInvoiceLine.create({
        data: {
          schoolId,
          feeInvoiceId: header.id,
          feeHeadId: l.feeHeadId,
          sourceFinePolicyId: l.sourceFinePolicyId ?? null,
          sourceDiscountId: l.sourceDiscountId ?? null,
          description: l.description,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          isLateFine: l.isLateFine,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      lineRows.push(mapLine(created));
    }
    return { header: mapHeader(header), lines: lineRows };
  }

  /**
   * Soft-delete every non-fine line on the invoice and insert a fresh set.
   * Late-fine lines (`isLateFine=true`) are preserved — apply-fines is the
   * only operation allowed to add or remove them.
   */
  public async replaceNonFineLines(
    invoiceId: string,
    lines: readonly CreateFeeInvoiceLineInput[],
    tx?: PrismaTx,
  ): Promise<readonly FeeInvoiceLineRow[]> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const now = new Date();
    await writer.feeInvoiceLine.updateMany({
      where: {
        schoolId,
        feeInvoiceId: invoiceId,
        deletedAt: null,
        isLateFine: false,
      },
      data: {
        deletedAt: now,
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    const out: FeeInvoiceLineRow[] = [];
    for (const l of lines) {
      const created = await writer.feeInvoiceLine.create({
        data: {
          schoolId,
          feeInvoiceId: invoiceId,
          feeHeadId: l.feeHeadId,
          sourceFinePolicyId: l.sourceFinePolicyId ?? null,
          sourceDiscountId: l.sourceDiscountId ?? null,
          description: l.description,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
          isLateFine: l.isLateFine,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      out.push(mapLine(created));
    }
    return out;
  }

  public async addLine(
    invoiceId: string,
    line: CreateFeeInvoiceLineInput,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceLineRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.feeInvoiceLine.create({
      data: {
        schoolId,
        feeInvoiceId: invoiceId,
        feeHeadId: line.feeHeadId,
        sourceFinePolicyId: line.sourceFinePolicyId ?? null,
        sourceDiscountId: line.sourceDiscountId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        isLateFine: line.isLateFine,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapLine(created);
  }

  public async updateTotals(
    id: string,
    expectedVersion: number,
    input: UpdateFeeInvoiceTotalsInput,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const current = await writer.feeInvoice.findFirst({
      where: { schoolId, id, deletedAt: null },
      select: { paidTotal: true },
    });
    if (current === null) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
    }
    const paidTotalNum = toNumber(current.paidTotal);
    const balanceTotal = input.total - paidTotalNum;
    const data: Record<string, unknown> = {
      subtotal: input.subtotal,
      discountTotal: input.discountTotal,
      taxTotal: input.taxTotal,
      total: input.total,
      balanceTotal,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.status !== undefined) data.status = input.status;
    const result = await writer.feeInvoice.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
    }
    const reloaded = await writer.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: FeeInvoiceStatusValue,
    tx?: PrismaTx,
  ): Promise<FeeInvoiceRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.feeInvoice.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        status,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
    }
    const reloaded = await writer.feeInvoice.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
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
    const result = await writer.feeInvoice.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeeInvoice', id, expectedVersion);
    }
  }
}

interface RawHeader {
  id: string;
  schoolId: string;
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  branchId: string | null;
  invoiceNo: string;
  periodFrom: Date;
  periodTo: Date;
  issueDate: Date;
  dueDate: Date;
  subtotal: unknown;
  discountTotal: unknown;
  taxTotal: unknown;
  total: unknown;
  paidTotal: unknown;
  refundTotal: unknown;
  balanceTotal: unknown;
  status: string;
  notes: string | null;
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
  feeInvoiceId: string;
  feeHeadId: string;
  sourceFinePolicyId: string | null;
  sourceDiscountId: string | null;
  description: string;
  quantity: number;
  unitAmount: unknown;
  discountAmount: unknown;
  taxAmount: unknown;
  lineTotal: unknown;
  isLateFine: boolean;
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

function mapHeader(row: RawHeader): FeeInvoiceRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    feeStructureId: row.feeStructureId,
    academicYearId: row.academicYearId,
    branchId: row.branchId,
    invoiceNo: row.invoiceNo,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    subtotal: toNumber(row.subtotal),
    discountTotal: toNumber(row.discountTotal),
    taxTotal: toNumber(row.taxTotal),
    total: toNumber(row.total),
    paidTotal: toNumber(row.paidTotal),
    refundTotal: toNumber(row.refundTotal),
    balanceTotal: toNumber(row.balanceTotal),
    status: row.status as FeeInvoiceStatusValue,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapLine(row: RawLine): FeeInvoiceLineRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    feeInvoiceId: row.feeInvoiceId,
    feeHeadId: row.feeHeadId,
    sourceFinePolicyId: row.sourceFinePolicyId,
    sourceDiscountId: row.sourceDiscountId,
    description: row.description,
    quantity: row.quantity,
    unitAmount: toNumber(row.unitAmount),
    discountAmount: toNumber(row.discountAmount),
    taxAmount: toNumber(row.taxAmount),
    lineTotal: toNumber(row.lineTotal),
    isLateFine: row.isLateFine,
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
