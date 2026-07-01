/**
 * InvoiceRepository — persistence for `billing_invoices` + `billing_invoice_lines`
 * + `billing_invoice_history`. Lines are replaced in-place for DRAFT invoices
 * only (the caller must guard the FSM); history is APPEND_ONLY.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import { BILLING_DEFAULT_CURRENCY } from '../billing.constants';
import {
  toNumber,
  type InvoiceHistoryAction,
  type InvoiceLineRow,
  type InvoiceLineTypeValue,
  type InvoiceRow,
  type InvoiceStatusValue,
} from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform invoice op' }),
  }),
});

export interface CreateInvoiceInput {
  readonly accountId: string;
  readonly schoolId: string;
  readonly invoiceNumber: string;
  readonly status?: InvoiceStatusValue;
  readonly fiscalYear: string;
  readonly subscriptionId?: string | null;
  readonly billingCycle?: string | null;
  readonly periodStart?: Date | null;
  readonly periodEnd?: Date | null;
  readonly issuedAt?: Date | null;
  readonly dueDate?: Date | null;
  readonly currency?: string;
  readonly subtotal?: number;
  readonly discountTotal?: number;
  readonly taxTotal?: number;
  readonly totalAmount?: number;
  readonly amountDue?: number;
  readonly profileSnapshot?: unknown;
  readonly addressSnapshot?: unknown;
  readonly taxSnapshot?: unknown;
  readonly notes?: string | null;
}

export interface UpdateInvoiceInput {
  readonly status?: InvoiceStatusValue;
  readonly subtotal?: number;
  readonly discountTotal?: number;
  readonly taxTotal?: number;
  readonly totalAmount?: number;
  readonly amountPaid?: number;
  readonly amountRefunded?: number;
  readonly amountDue?: number;
  readonly profileSnapshot?: unknown;
  readonly addressSnapshot?: unknown;
  readonly taxSnapshot?: unknown;
  readonly dueDate?: Date | null;
  readonly issuedAt?: Date | null;
  readonly paidAt?: Date | null;
  readonly voidedAt?: Date | null;
  readonly voidReason?: string | null;
  readonly notes?: string | null;
}

export interface CreateInvoiceLineInput {
  readonly lineType: InvoiceLineTypeValue;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly taxCode?: string | null;
  readonly taxRate?: number | null;
  readonly taxAmount?: number;
  readonly metadata?: unknown;
  readonly sortOrder?: number;
}

export interface ListInvoicesArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly accountId?: string;
  readonly status?: InvoiceStatusValue;
  readonly fiscalYear?: string;
  readonly subscriptionId?: string;
  readonly dueBefore?: Date;
}

export interface AppendInvoiceHistoryInput {
  readonly invoiceId: string;
  readonly schoolId: string;
  readonly action: InvoiceHistoryAction;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly amount?: number | null;
  readonly notes?: string | null;
  readonly actorUserId?: string | null;
  readonly metadata?: unknown;
}

export interface InvoiceHistoryRow {
  readonly id: string;
  readonly invoiceId: string;
  readonly schoolId: string;
  readonly action: InvoiceHistoryAction;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly amount: number | null;
  readonly notes: string | null;
  readonly actorUserId: string | null;
  readonly metadata: unknown;
  readonly occurredAt: Date;
}

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  // -------------------------------------------------------------------------
  // Invoice header
  // -------------------------------------------------------------------------
  public async findById(id: string, tx?: PrismaTx): Promise<InvoiceRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.invoice.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapInvoice(row as RawInvoice);
  }

  public async findByNumber(
    invoiceNumber: string,
    tx?: PrismaTx,
  ): Promise<InvoiceRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.invoice.findFirst({
      where: { invoiceNumber, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapInvoice(row as RawInvoice);
  }

  public async findWithLines(
    id: string,
    tx?: PrismaTx,
  ): Promise<{ readonly invoice: InvoiceRow; readonly lines: readonly InvoiceLineRow[] } | null> {
    const reader = this.resolve(tx);
    const row = await reader.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: [{ sortOrder: 'asc' }] } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    } as never);
    if (row === null) return null;
    const r = row as unknown as RawInvoice & { lines: RawInvoiceLine[] };
    return {
      invoice: mapInvoice(r),
      lines: r.lines.map(mapLine),
    };
  }

  public async list(
    args: ListInvoicesArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly InvoiceRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.accountId !== undefined) where.accountId = args.accountId;
    if (args.status !== undefined) where.status = args.status;
    if (args.fiscalYear !== undefined) where.fiscalYear = args.fiscalYear;
    if (args.subscriptionId !== undefined) where.subscriptionId = args.subscriptionId;
    if (args.dueBefore !== undefined) where.dueDate = { lte: args.dueBefore };
    const rows = await reader.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { id: args.cursorId }, skip: 1 }
        : {}),
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? (last as { id: string }).id : null;
    return {
      rows: trimmed.map((r) => mapInvoice(r as RawInvoice)),
      nextCursorId,
    };
  }

  public async createInvoice(input: CreateInvoiceInput, tx?: PrismaTx): Promise<InvoiceRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.invoice.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        schoolId: input.schoolId,
        invoiceNumber: input.invoiceNumber,
        status: input.status ?? 'DRAFT',
        fiscalYear: input.fiscalYear,
        subscriptionId: input.subscriptionId ?? null,
        billingCycle: input.billingCycle ?? null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        issuedAt: input.issuedAt ?? null,
        dueDate: input.dueDate ?? null,
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        subtotal: input.subtotal ?? 0,
        discountTotal: input.discountTotal ?? 0,
        taxTotal: input.taxTotal ?? 0,
        totalAmount: input.totalAmount ?? 0,
        amountDue: input.amountDue ?? input.totalAmount ?? 0,
        profileSnapshot: input.profileSnapshot ?? null,
        addressSnapshot: input.addressSnapshot ?? null,
        taxSnapshot: input.taxSnapshot ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapInvoice(created as RawInvoice);
  }

  /**
   * Replace ALL lines on a DRAFT invoice. Caller is responsible for verifying
   * the invoice is still DRAFT — the repository only enforces row-count
   * semantics and leaves FSM validation to the service.
   */
  public async replaceLines(
    invoiceId: string,
    lines: readonly CreateInvoiceLineInput[],
    tx?: PrismaTx,
  ): Promise<readonly InvoiceLineRow[]> {
    const writer = this.resolve(tx);
    await writer.invoiceLine.deleteMany({
      where: { invoiceId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (lines.length === 0) return [];
    const payload = lines.map((line, index) => ({
      id: randomUUID(),
      invoiceId,
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      taxCode: line.taxCode ?? null,
      taxRate: line.taxRate ?? null,
      taxAmount: line.taxAmount ?? 0,
      metadata: line.metadata ?? null,
      sortOrder: line.sortOrder ?? index,
    }));
    await writer.invoiceLine.createMany({
      data: payload as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const rows = await writer.invoiceLine.findMany({
      where: { invoiceId },
      orderBy: [{ sortOrder: 'asc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapLine(r as RawInvoiceLine));
  }

  public async updateInvoice(
    id: string,
    expectedVersion: number,
    patch: UpdateInvoiceInput,
    tx?: PrismaTx,
  ): Promise<InvoiceRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.subtotal !== undefined) data.subtotal = patch.subtotal;
    if (patch.discountTotal !== undefined) data.discountTotal = patch.discountTotal;
    if (patch.taxTotal !== undefined) data.taxTotal = patch.taxTotal;
    if (patch.totalAmount !== undefined) data.totalAmount = patch.totalAmount;
    if (patch.amountPaid !== undefined) data.amountPaid = patch.amountPaid;
    if (patch.amountRefunded !== undefined) data.amountRefunded = patch.amountRefunded;
    if (patch.amountDue !== undefined) data.amountDue = patch.amountDue;
    if (patch.profileSnapshot !== undefined) data.profileSnapshot = patch.profileSnapshot;
    if (patch.addressSnapshot !== undefined) data.addressSnapshot = patch.addressSnapshot;
    if (patch.taxSnapshot !== undefined) data.taxSnapshot = patch.taxSnapshot;
    if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
    if (patch.issuedAt !== undefined) data.issuedAt = patch.issuedAt;
    if (patch.paidAt !== undefined) data.paidAt = patch.paidAt;
    if (patch.voidedAt !== undefined) data.voidedAt = patch.voidedAt;
    if (patch.voidReason !== undefined) data.voidReason = patch.voidReason;
    if (patch.notes !== undefined) data.notes = patch.notes;

    const result = await writer.invoice.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Invoice', id, expectedVersion);
    }
    const reloaded = await writer.invoice.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('Invoice', id, expectedVersion);
    }
    return mapInvoice(reloaded as RawInvoice);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.invoice.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Invoice', id, expectedVersion);
    }
  }

  // -------------------------------------------------------------------------
  // InvoiceHistory — APPEND_ONLY
  // -------------------------------------------------------------------------
  public async appendHistory(
    input: AppendInvoiceHistoryInput,
    tx?: PrismaTx,
  ): Promise<InvoiceHistoryRow> {
    const writer = this.resolve(tx);
    const userId = input.actorUserId ?? this.currentUserId();
    const row = await writer.invoiceHistory.create({
      data: {
        id: randomUUID(),
        invoiceId: input.invoiceId,
        schoolId: input.schoolId,
        action: input.action,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        amount: input.amount ?? null,
        notes: input.notes ?? null,
        actorUserId: userId,
        metadata: input.metadata ?? null,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapHistory(row as RawHistory);
  }

  public async listHistory(
    invoiceId: string,
    tx?: PrismaTx,
  ): Promise<readonly InvoiceHistoryRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.invoiceHistory.findMany({
      where: { invoiceId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapHistory(r as RawHistory));
  }
}

// ---------------------------------------------------------------------------
// Raw shapes + mappers
// ---------------------------------------------------------------------------
interface RawInvoice {
  id: string;
  accountId: string;
  schoolId: string;
  invoiceNumber: string;
  status: InvoiceStatusValue;
  fiscalYear: string;
  subscriptionId: string | null;
  billingCycle: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  currency: string;
  subtotal: unknown;
  discountTotal: unknown;
  taxTotal: unknown;
  totalAmount: unknown;
  amountPaid: unknown;
  amountRefunded: unknown;
  amountDue: unknown;
  profileSnapshot: unknown;
  addressSnapshot: unknown;
  taxSnapshot: unknown;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawInvoiceLine {
  id: string;
  invoiceId: string;
  lineType: InvoiceLineTypeValue;
  description: string;
  quantity: unknown;
  unitPrice: unknown;
  amount: unknown;
  taxCode: string | null;
  taxRate: unknown;
  taxAmount: unknown;
  metadata: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RawHistory {
  id: string;
  invoiceId: string;
  schoolId: string;
  action: InvoiceHistoryAction;
  fromStatus: string | null;
  toStatus: string | null;
  amount: unknown;
  notes: string | null;
  actorUserId: string | null;
  metadata: unknown;
  occurredAt: Date;
}

function mapInvoice(row: RawInvoice): InvoiceRow {
  return {
    id: row.id,
    accountId: row.accountId,
    schoolId: row.schoolId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    fiscalYear: row.fiscalYear,
    subscriptionId: row.subscriptionId,
    billingCycle: row.billingCycle,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    issuedAt: row.issuedAt,
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    currency: row.currency,
    subtotal: toNumber(row.subtotal),
    discountTotal: toNumber(row.discountTotal),
    taxTotal: toNumber(row.taxTotal),
    totalAmount: toNumber(row.totalAmount),
    amountPaid: toNumber(row.amountPaid),
    amountRefunded: toNumber(row.amountRefunded),
    amountDue: toNumber(row.amountDue),
    profileSnapshot: row.profileSnapshot,
    addressSnapshot: row.addressSnapshot,
    taxSnapshot: row.taxSnapshot,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapLine(row: RawInvoiceLine): InvoiceLineRow {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    lineType: row.lineType,
    description: row.description,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    amount: toNumber(row.amount),
    taxCode: row.taxCode,
    taxRate: row.taxRate === null ? null : toNumber(row.taxRate),
    taxAmount: toNumber(row.taxAmount),
    metadata: row.metadata,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapHistory(row: RawHistory): InvoiceHistoryRow {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    schoolId: row.schoolId,
    action: row.action,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    amount: row.amount === null ? null : toNumber(row.amount),
    notes: row.notes,
    actorUserId: row.actorUserId,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
  };
}
