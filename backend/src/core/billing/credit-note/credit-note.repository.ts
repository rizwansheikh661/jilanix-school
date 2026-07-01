/**
 * CreditNoteRepository — persistence for `billing_credit_notes` and
 * `billing_adjustments`. Both are soft-delete + version-guarded. Adjustment
 * amounts are signed by `kind` (CREDIT reduces balance, DEBIT raises it) and
 * are persisted as the absolute decimal value paired with the enum.
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
  type AdjustmentKindValue,
  type AdjustmentRow,
  type CreditNoteRow,
  type CreditNoteStatusValue,
} from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform credit-note op' }),
  }),
});

export interface CreateCreditNoteInput {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly schoolId: string;
  readonly creditNoteNumber: string;
  readonly status?: CreditNoteStatusValue;
  readonly currency?: string;
  readonly amount: number;
  readonly reason: string;
  readonly fiscalYear: string;
}

export interface UpdateCreditNoteInput {
  readonly status?: CreditNoteStatusValue;
  readonly amount?: number;
  readonly amountApplied?: number;
  readonly reason?: string;
  readonly appliedAt?: Date | null;
  readonly appliedToInvoiceId?: string | null;
  readonly voidedAt?: Date | null;
  readonly voidReason?: string | null;
}

export interface ListCreditNotesArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly accountId?: string;
  readonly status?: CreditNoteStatusValue;
}

export interface CreateAdjustmentInput {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly schoolId: string;
  readonly kind: AdjustmentKindValue;
  readonly currency?: string;
  readonly amount: number;
  readonly reason: string;
}

export interface ListAdjustmentsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly accountId?: string;
  readonly kind?: AdjustmentKindValue;
}

@Injectable()
export class CreditNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  // -------------------------------------------------------------------------
  // CreditNote
  // -------------------------------------------------------------------------
  public async findCreditNoteById(id: string, tx?: PrismaTx): Promise<CreditNoteRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.creditNote.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapCreditNote(row as RawCreditNote);
  }

  public async findByNumber(
    creditNoteNumber: string,
    tx?: PrismaTx,
  ): Promise<CreditNoteRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.creditNote.findFirst({
      where: { creditNoteNumber, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapCreditNote(row as RawCreditNote);
  }

  public async listCreditNotes(
    args: ListCreditNotesArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly CreditNoteRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.accountId !== undefined) where.accountId = args.accountId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.creditNote.findMany({
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
      rows: trimmed.map((r) => mapCreditNote(r as RawCreditNote)),
      nextCursorId,
    };
  }

  public async createCreditNote(
    input: CreateCreditNoteInput,
    tx?: PrismaTx,
  ): Promise<CreditNoteRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.creditNote.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        invoiceId: input.invoiceId ?? null,
        schoolId: input.schoolId,
        creditNoteNumber: input.creditNoteNumber,
        status: input.status ?? 'ISSUED',
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        amount: input.amount,
        reason: input.reason,
        fiscalYear: input.fiscalYear,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapCreditNote(created as RawCreditNote);
  }

  public async updateCreditNote(
    id: string,
    expectedVersion: number,
    patch: UpdateCreditNoteInput,
    tx?: PrismaTx,
  ): Promise<CreditNoteRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.amountApplied !== undefined) data.amountApplied = patch.amountApplied;
    if (patch.reason !== undefined) data.reason = patch.reason;
    if (patch.appliedAt !== undefined) data.appliedAt = patch.appliedAt;
    if (patch.appliedToInvoiceId !== undefined) data.appliedToInvoiceId = patch.appliedToInvoiceId;
    if (patch.voidedAt !== undefined) data.voidedAt = patch.voidedAt;
    if (patch.voidReason !== undefined) data.voidReason = patch.voidReason;

    const result = await writer.creditNote.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('CreditNote', id, expectedVersion);
    }
    const reloaded = await writer.creditNote.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('CreditNote', id, expectedVersion);
    }
    return mapCreditNote(reloaded as RawCreditNote);
  }

  public async softDeleteCreditNote(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.creditNote.updateMany({
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
      throw new VersionConflictError('CreditNote', id, expectedVersion);
    }
  }

  // -------------------------------------------------------------------------
  // Adjustment
  // -------------------------------------------------------------------------
  public async findAdjustmentById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AdjustmentRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.adjustment.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapAdjustment(row as RawAdjustment);
  }

  public async listAdjustments(
    args: ListAdjustmentsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AdjustmentRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.accountId !== undefined) where.accountId = args.accountId;
    if (args.kind !== undefined) where.kind = args.kind;
    const rows = await reader.adjustment.findMany({
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
      rows: trimmed.map((r) => mapAdjustment(r as RawAdjustment)),
      nextCursorId,
    };
  }

  public async createAdjustment(
    input: CreateAdjustmentInput,
    tx?: PrismaTx,
  ): Promise<AdjustmentRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.adjustment.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        invoiceId: input.invoiceId ?? null,
        schoolId: input.schoolId,
        kind: input.kind,
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        amount: input.amount,
        reason: input.reason,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapAdjustment(created as RawAdjustment);
  }

  public async softDeleteAdjustment(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.adjustment.updateMany({
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
      throw new VersionConflictError('Adjustment', id, expectedVersion);
    }
  }
}

// ---------------------------------------------------------------------------
// Raw + mappers
// ---------------------------------------------------------------------------
interface RawCreditNote {
  id: string;
  accountId: string;
  invoiceId: string | null;
  schoolId: string;
  creditNoteNumber: string;
  status: CreditNoteStatusValue;
  currency: string;
  amount: unknown;
  amountApplied: unknown;
  reason: string;
  fiscalYear: string;
  appliedAt: Date | null;
  appliedToInvoiceId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawAdjustment {
  id: string;
  accountId: string;
  invoiceId: string | null;
  schoolId: string;
  kind: AdjustmentKindValue;
  currency: string;
  amount: unknown;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapCreditNote(row: RawCreditNote): CreditNoteRow {
  return {
    id: row.id,
    accountId: row.accountId,
    invoiceId: row.invoiceId,
    schoolId: row.schoolId,
    creditNoteNumber: row.creditNoteNumber,
    status: row.status,
    currency: row.currency,
    amount: toNumber(row.amount),
    amountApplied: toNumber(row.amountApplied),
    reason: row.reason,
    fiscalYear: row.fiscalYear,
    appliedAt: row.appliedAt,
    appliedToInvoiceId: row.appliedToInvoiceId,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapAdjustment(row: RawAdjustment): AdjustmentRow {
  return {
    id: row.id,
    accountId: row.accountId,
    invoiceId: row.invoiceId,
    schoolId: row.schoolId,
    kind: row.kind,
    currency: row.currency,
    amount: toNumber(row.amount),
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
