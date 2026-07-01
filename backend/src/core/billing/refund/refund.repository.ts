/**
 * RefundRepository — persistence for `billing_refunds`.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import { BILLING_DEFAULT_CURRENCY } from '../billing.constants';
import { toNumber, type RefundRow, type RefundStatusValue } from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform refund op' }),
  }),
});

export interface CreateRefundInput {
  readonly accountId: string;
  readonly invoiceId?: string | null;
  readonly paymentId: string;
  readonly schoolId: string;
  readonly refundNumber: string;
  readonly status?: RefundStatusValue;
  readonly currency?: string;
  readonly amount: number;
  readonly reason: string;
  readonly externalReference?: string | null;
}

export interface UpdateRefundInput {
  readonly status?: RefundStatusValue;
  readonly amount?: number;
  readonly reason?: string;
  readonly approvedAt?: Date | null;
  readonly approvedBy?: string | null;
  readonly rejectedAt?: Date | null;
  readonly rejectedBy?: string | null;
  readonly rejectionReason?: string | null;
  readonly processedAt?: Date | null;
  readonly processedBy?: string | null;
  readonly gatewayRefundId?: string | null;
  readonly externalReference?: string | null;
}

export interface ListRefundsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly schoolId?: string;
  readonly paymentId?: string;
  readonly invoiceId?: string;
  readonly status?: RefundStatusValue;
}

@Injectable()
export class RefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<RefundRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.refund.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawRefund);
  }

  public async findByNumber(
    refundNumber: string,
    tx?: PrismaTx,
  ): Promise<RefundRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.refund.findFirst({
      where: { refundNumber, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawRefund);
  }

  public async list(
    args: ListRefundsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly RefundRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.paymentId !== undefined) where.paymentId = args.paymentId;
    if (args.invoiceId !== undefined) where.invoiceId = args.invoiceId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.refund.findMany({
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
      rows: trimmed.map((r) => mapRow(r as RawRefund)),
      nextCursorId,
    };
  }

  public async create(input: CreateRefundInput, tx?: PrismaTx): Promise<RefundRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.refund.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        invoiceId: input.invoiceId ?? null,
        paymentId: input.paymentId,
        schoolId: input.schoolId,
        refundNumber: input.refundNumber,
        status: input.status ?? 'PENDING',
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        amount: input.amount,
        reason: input.reason,
        externalReference: input.externalReference ?? null,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as RawRefund);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateRefundInput,
    tx?: PrismaTx,
  ): Promise<RefundRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.reason !== undefined) data.reason = patch.reason;
    if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt;
    if (patch.approvedBy !== undefined) data.approvedBy = patch.approvedBy;
    if (patch.rejectedAt !== undefined) data.rejectedAt = patch.rejectedAt;
    if (patch.rejectedBy !== undefined) data.rejectedBy = patch.rejectedBy;
    if (patch.rejectionReason !== undefined) data.rejectionReason = patch.rejectionReason;
    if (patch.processedAt !== undefined) data.processedAt = patch.processedAt;
    if (patch.processedBy !== undefined) data.processedBy = patch.processedBy;
    if (patch.gatewayRefundId !== undefined) data.gatewayRefundId = patch.gatewayRefundId;
    if (patch.externalReference !== undefined) data.externalReference = patch.externalReference;

    const result = await writer.refund.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('Refund', id, expectedVersion);
    }
    const reloaded = await writer.refund.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('Refund', id, expectedVersion);
    }
    return mapRow(reloaded as RawRefund);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.refund.updateMany({
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
      throw new VersionConflictError('Refund', id, expectedVersion);
    }
  }
}

interface RawRefund {
  id: string;
  accountId: string;
  invoiceId: string | null;
  paymentId: string;
  schoolId: string;
  refundNumber: string;
  status: RefundStatusValue;
  currency: string;
  amount: unknown;
  reason: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  processedAt: Date | null;
  processedBy: string | null;
  gatewayRefundId: string | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(row: RawRefund): RefundRow {
  return {
    id: row.id,
    accountId: row.accountId,
    invoiceId: row.invoiceId,
    paymentId: row.paymentId,
    schoolId: row.schoolId,
    refundNumber: row.refundNumber,
    status: row.status,
    currency: row.currency,
    amount: toNumber(row.amount),
    reason: row.reason,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    rejectedAt: row.rejectedAt,
    rejectedBy: row.rejectedBy,
    rejectionReason: row.rejectionReason,
    processedAt: row.processedAt,
    processedBy: row.processedBy,
    gatewayRefundId: row.gatewayRefundId,
    externalReference: row.externalReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
