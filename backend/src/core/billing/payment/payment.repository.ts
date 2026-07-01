/**
 * PaymentRepository — persistence for `billing_payments` and the APPEND_ONLY
 * `billing_payment_attempts` ledger.
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
  type PaymentAttemptRow,
  type PaymentAttemptStatusValue,
  type PaymentMethodValue,
  type PaymentRow,
  type PaymentStatusValue,
} from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform payment op' }),
  }),
});

export interface CreatePaymentInput {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly schoolId: string;
  readonly receiptNumber: string;
  readonly method: PaymentMethodValue;
  readonly status?: PaymentStatusValue;
  readonly currency?: string;
  readonly amount: number;
  readonly feeAmount?: number;
  readonly netAmount?: number;
  readonly fiscalYear: string;
  readonly gatewayOrderId?: string | null;
  readonly gatewayPaymentId?: string | null;
  readonly gatewaySignature?: string | null;
  readonly externalReference?: string | null;
  readonly proofUrl?: string | null;
  readonly payerNotes?: string | null;
  readonly receivedAt?: Date | null;
  readonly paymentSourceId?: string | null;
}

export interface UpdatePaymentInput {
  readonly status?: PaymentStatusValue;
  readonly amount?: number;
  readonly feeAmount?: number;
  readonly netAmount?: number;
  readonly gatewayOrderId?: string | null;
  readonly gatewayPaymentId?: string | null;
  readonly gatewaySignature?: string | null;
  readonly externalReference?: string | null;
  readonly proofUrl?: string | null;
  readonly payerNotes?: string | null;
  readonly receivedAt?: Date | null;
  readonly approvedAt?: Date | null;
  readonly approvedBy?: string | null;
  readonly rejectedAt?: Date | null;
  readonly rejectedBy?: string | null;
  readonly rejectionReason?: string | null;
  readonly holdReason?: string | null;
  readonly paymentSourceId?: string | null;
}

export interface ListPaymentsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly accountId?: string;
  readonly invoiceId?: string;
  readonly status?: PaymentStatusValue;
  readonly method?: PaymentMethodValue;
}

export interface AppendPaymentAttemptInput {
  readonly paymentId: string;
  readonly status: PaymentAttemptStatusValue;
  readonly amount: number;
  readonly gatewayOrderId?: string | null;
  readonly gatewayPaymentId?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly rawResponse?: unknown;
}

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<PaymentRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.payment.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapPayment(row as RawPayment);
  }

  public async findByReceiptNumber(
    receiptNumber: string,
    tx?: PrismaTx,
  ): Promise<PaymentRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.payment.findFirst({
      where: { receiptNumber, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapPayment(row as RawPayment);
  }

  public async findByGatewayOrder(
    gatewayOrderId: string,
    tx?: PrismaTx,
  ): Promise<PaymentRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.payment.findFirst({
      where: { gatewayOrderId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapPayment(row as RawPayment);
  }

  public async findByGatewayPayment(
    gatewayPaymentId: string,
    tx?: PrismaTx,
  ): Promise<PaymentRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.payment.findFirst({
      where: { gatewayPaymentId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapPayment(row as RawPayment);
  }

  public async list(
    args: ListPaymentsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly PaymentRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.accountId !== undefined) where.accountId = args.accountId;
    if (args.invoiceId !== undefined) where.invoiceId = args.invoiceId;
    if (args.status !== undefined) where.status = args.status;
    if (args.method !== undefined) where.method = args.method;
    const rows = await reader.payment.findMany({
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
      rows: trimmed.map((r) => mapPayment(r as RawPayment)),
      nextCursorId,
    };
  }

  public async create(input: CreatePaymentInput, tx?: PrismaTx): Promise<PaymentRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.payment.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        invoiceId: input.invoiceId ?? null,
        schoolId: input.schoolId,
        receiptNumber: input.receiptNumber,
        method: input.method,
        status: input.status ?? 'PENDING',
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        amount: input.amount,
        feeAmount: input.feeAmount ?? 0,
        netAmount: input.netAmount ?? input.amount,
        fiscalYear: input.fiscalYear,
        gatewayOrderId: input.gatewayOrderId ?? null,
        gatewayPaymentId: input.gatewayPaymentId ?? null,
        gatewaySignature: input.gatewaySignature ?? null,
        externalReference: input.externalReference ?? null,
        proofUrl: input.proofUrl ?? null,
        payerNotes: input.payerNotes ?? null,
        receivedAt: input.receivedAt ?? null,
        paymentSourceId: input.paymentSourceId ?? null,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapPayment(created as RawPayment);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePaymentInput,
    tx?: PrismaTx,
  ): Promise<PaymentRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.feeAmount !== undefined) data.feeAmount = patch.feeAmount;
    if (patch.netAmount !== undefined) data.netAmount = patch.netAmount;
    if (patch.gatewayOrderId !== undefined) data.gatewayOrderId = patch.gatewayOrderId;
    if (patch.gatewayPaymentId !== undefined) data.gatewayPaymentId = patch.gatewayPaymentId;
    if (patch.gatewaySignature !== undefined) data.gatewaySignature = patch.gatewaySignature;
    if (patch.externalReference !== undefined) data.externalReference = patch.externalReference;
    if (patch.proofUrl !== undefined) data.proofUrl = patch.proofUrl;
    if (patch.payerNotes !== undefined) data.payerNotes = patch.payerNotes;
    if (patch.receivedAt !== undefined) data.receivedAt = patch.receivedAt;
    if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt;
    if (patch.approvedBy !== undefined) data.approvedBy = patch.approvedBy;
    if (patch.rejectedAt !== undefined) data.rejectedAt = patch.rejectedAt;
    if (patch.rejectedBy !== undefined) data.rejectedBy = patch.rejectedBy;
    if (patch.rejectionReason !== undefined) data.rejectionReason = patch.rejectionReason;
    if (patch.holdReason !== undefined) data.holdReason = patch.holdReason;
    if (patch.paymentSourceId !== undefined) data.paymentSourceId = patch.paymentSourceId;

    const result = await writer.payment.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Payment', id, expectedVersion);
    }
    const reloaded = await writer.payment.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('Payment', id, expectedVersion);
    }
    return mapPayment(reloaded as RawPayment);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.payment.updateMany({
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
      throw new VersionConflictError('Payment', id, expectedVersion);
    }
  }

  /**
   * Atomic increment of `amountRefunded`. Does NOT bump `version` — refund
   * events are driven by separate Refund rows and should not collide with
   * user-driven optimistic updates of the payment header.
   */
  public async incrementRefunded(
    id: string,
    amount: number,
    tx?: PrismaTx,
  ): Promise<PaymentRow> {
    const writer = this.resolve(tx);
    const updated = await writer.payment.update({
      where: { id },
      data: { amountRefunded: { increment: amount } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapPayment(updated as RawPayment);
  }

  // -------------------------------------------------------------------------
  // PaymentAttempt — APPEND_ONLY
  // -------------------------------------------------------------------------
  public async appendAttempt(
    input: AppendPaymentAttemptInput,
    tx?: PrismaTx,
  ): Promise<PaymentAttemptRow> {
    const writer = this.resolve(tx);
    const row = await writer.paymentAttempt.create({
      data: {
        id: randomUUID(),
        paymentId: input.paymentId,
        status: input.status,
        amount: input.amount,
        gatewayOrderId: input.gatewayOrderId ?? null,
        gatewayPaymentId: input.gatewayPaymentId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        rawResponse: input.rawResponse ?? null,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapAttempt(row as RawAttempt);
  }

  public async listAttempts(
    paymentId: string,
    tx?: PrismaTx,
  ): Promise<readonly PaymentAttemptRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.paymentAttempt.findMany({
      where: { paymentId },
      orderBy: [{ attemptedAt: 'asc' }, { id: 'asc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapAttempt(r as RawAttempt));
  }
}

// ---------------------------------------------------------------------------
// Raw + mappers
// ---------------------------------------------------------------------------
interface RawPayment {
  id: string;
  accountId: string;
  invoiceId: string | null;
  schoolId: string;
  receiptNumber: string;
  method: PaymentMethodValue;
  status: PaymentStatusValue;
  currency: string;
  amount: unknown;
  amountRefunded: unknown;
  feeAmount: unknown;
  netAmount: unknown;
  fiscalYear: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  gatewaySignature: string | null;
  externalReference: string | null;
  proofUrl: string | null;
  payerNotes: string | null;
  receivedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  holdReason: string | null;
  paymentSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawAttempt {
  id: string;
  paymentId: string;
  status: PaymentAttemptStatusValue;
  amount: unknown;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse: unknown;
  attemptedAt: Date;
}

function mapPayment(row: RawPayment): PaymentRow {
  return {
    id: row.id,
    accountId: row.accountId,
    invoiceId: row.invoiceId,
    schoolId: row.schoolId,
    receiptNumber: row.receiptNumber,
    method: row.method,
    status: row.status,
    currency: row.currency,
    amount: toNumber(row.amount),
    amountRefunded: toNumber(row.amountRefunded),
    feeAmount: toNumber(row.feeAmount),
    netAmount: toNumber(row.netAmount),
    fiscalYear: row.fiscalYear,
    gatewayOrderId: row.gatewayOrderId,
    gatewayPaymentId: row.gatewayPaymentId,
    gatewaySignature: row.gatewaySignature,
    externalReference: row.externalReference,
    proofUrl: row.proofUrl,
    payerNotes: row.payerNotes,
    receivedAt: row.receivedAt,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    rejectedAt: row.rejectedAt,
    rejectedBy: row.rejectedBy,
    rejectionReason: row.rejectionReason,
    holdReason: row.holdReason,
    paymentSourceId: row.paymentSourceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapAttempt(row: RawAttempt): PaymentAttemptRow {
  return {
    id: row.id,
    paymentId: row.paymentId,
    status: row.status,
    amount: toNumber(row.amount),
    gatewayOrderId: row.gatewayOrderId,
    gatewayPaymentId: row.gatewayPaymentId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    rawResponse: row.rawResponse,
    attemptedAt: row.attemptedAt,
  };
}
