/**
 * PaymentSourceRepository — persistence for `billing_payment_sources`. RAZORPAY
 * sources keep their key/webhook secrets encrypted at rest via CryptoService;
 * the public row never exposes the ciphertext, only boolean presence flags.
 *
 * `getRazorpaySecrets` is the ONLY method that ever returns plaintext. It is
 * meant for the Razorpay client/signature verification path only.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { CryptoService } from '../../../infra/crypto/crypto.service';
import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import { PaymentSourceNotFoundError } from '../billing.errors';
import type { PaymentSourceRow, PaymentSourceTypeValue } from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform payment source op' }),
  }),
});

export interface CreatePaymentSourceInput {
  readonly sourceType: PaymentSourceTypeValue;
  readonly name: string;
  readonly description?: string | null;
  readonly isActive?: boolean;
  readonly isDefault?: boolean;
  readonly priority?: number;
  readonly razorpayKeyId?: string | null;
  /** Plaintext — sealed before persisting. */
  readonly razorpayKeySecret?: string | null;
  /** Plaintext — sealed before persisting. */
  readonly razorpayWebhookSecret?: string | null;
  readonly upiHandle?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankIfsc?: string | null;
  readonly bankBranch?: string | null;
  readonly bankAccountHolder?: string | null;
  readonly instructions?: string | null;
}

export interface UpdatePaymentSourceInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly isActive?: boolean;
  readonly isDefault?: boolean;
  readonly priority?: number;
  readonly razorpayKeyId?: string | null;
  /** Plaintext — sealed before persisting. */
  readonly razorpayKeySecret?: string | null;
  /** Plaintext — sealed before persisting. */
  readonly razorpayWebhookSecret?: string | null;
  readonly upiHandle?: string | null;
  readonly bankName?: string | null;
  readonly bankAccountNumber?: string | null;
  readonly bankIfsc?: string | null;
  readonly bankBranch?: string | null;
  readonly bankAccountHolder?: string | null;
  readonly instructions?: string | null;
}

export interface ListPaymentSourcesArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly sourceType?: PaymentSourceTypeValue;
  readonly isActive?: boolean;
}

export interface RazorpaySecrets {
  readonly keyId: string | null;
  readonly keySecret: string | null;
  readonly webhookSecret: string | null;
}

@Injectable()
export class PaymentSourceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<PaymentSourceRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.paymentSourceConfiguration.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawPaymentSource);
  }

  public async findActiveByType(
    sourceType: PaymentSourceTypeValue,
    tx?: PrismaTx,
  ): Promise<readonly PaymentSourceRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.paymentSourceConfiguration.findMany({
      where: { sourceType, isActive: true, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return rows.map((r) => mapRow(r as RawPaymentSource));
  }

  public async findDefault(tx?: PrismaTx): Promise<PaymentSourceRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.paymentSourceConfiguration.findFirst({
      where: { isDefault: true, isActive: true, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawPaymentSource);
  }

  public async list(
    args: ListPaymentSourcesArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly PaymentSourceRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.sourceType !== undefined) where.sourceType = args.sourceType;
    if (args.isActive !== undefined) where.isActive = args.isActive;
    const rows = await reader.paymentSourceConfiguration.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
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
      rows: trimmed.map((r) => mapRow(r as RawPaymentSource)),
      nextCursorId,
    };
  }

  public async create(
    input: CreatePaymentSourceInput,
    tx?: PrismaTx,
  ): Promise<PaymentSourceRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const keySecretEnc =
      input.razorpayKeySecret !== undefined && input.razorpayKeySecret !== null
        ? this.cryptoService.sealString(input.razorpayKeySecret)
        : null;
    const webhookSecretEnc =
      input.razorpayWebhookSecret !== undefined && input.razorpayWebhookSecret !== null
        ? this.cryptoService.sealString(input.razorpayWebhookSecret)
        : null;
    const created = await writer.paymentSourceConfiguration.create({
      data: {
        id: randomUUID(),
        sourceType: input.sourceType,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        priority: input.priority ?? 0,
        razorpayKeyId: input.razorpayKeyId ?? null,
        razorpayKeySecretEnc: keySecretEnc,
        razorpayWebhookSecretEnc: webhookSecretEnc,
        upiHandle: input.upiHandle ?? null,
        bankName: input.bankName ?? null,
        bankAccountNumber: input.bankAccountNumber ?? null,
        bankIfsc: input.bankIfsc ?? null,
        bankBranch: input.bankBranch ?? null,
        bankAccountHolder: input.bankAccountHolder ?? null,
        instructions: input.instructions ?? null,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as RawPaymentSource);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePaymentSourceInput,
    tx?: PrismaTx,
  ): Promise<PaymentSourceRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.razorpayKeyId !== undefined) data.razorpayKeyId = patch.razorpayKeyId;
    if (patch.razorpayKeySecret !== undefined) {
      data.razorpayKeySecretEnc =
        patch.razorpayKeySecret === null
          ? null
          : this.cryptoService.sealString(patch.razorpayKeySecret);
    }
    if (patch.razorpayWebhookSecret !== undefined) {
      data.razorpayWebhookSecretEnc =
        patch.razorpayWebhookSecret === null
          ? null
          : this.cryptoService.sealString(patch.razorpayWebhookSecret);
    }
    if (patch.upiHandle !== undefined) data.upiHandle = patch.upiHandle;
    if (patch.bankName !== undefined) data.bankName = patch.bankName;
    if (patch.bankAccountNumber !== undefined) data.bankAccountNumber = patch.bankAccountNumber;
    if (patch.bankIfsc !== undefined) data.bankIfsc = patch.bankIfsc;
    if (patch.bankBranch !== undefined) data.bankBranch = patch.bankBranch;
    if (patch.bankAccountHolder !== undefined) data.bankAccountHolder = patch.bankAccountHolder;
    if (patch.instructions !== undefined) data.instructions = patch.instructions;

    const result = await writer.paymentSourceConfiguration.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('PaymentSourceConfiguration', id, expectedVersion);
    }
    const reloaded = await writer.paymentSourceConfiguration.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('PaymentSourceConfiguration', id, expectedVersion);
    }
    return mapRow(reloaded as RawPaymentSource);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.paymentSourceConfiguration.updateMany({
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
      throw new VersionConflictError('PaymentSourceConfiguration', id, expectedVersion);
    }
  }

  /**
   * Decrypt and return the Razorpay secrets for this source. THE ONLY method
   * that exposes plaintext. Callers are expected to use the returned values
   * only for outbound Razorpay client construction or webhook signature
   * verification, and never to echo them on a response.
   */
  public async getRazorpaySecrets(id: string, tx?: PrismaTx): Promise<RazorpaySecrets> {
    const reader = this.resolve(tx);
    const row = (await reader.paymentSourceConfiguration.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    })) as RawPaymentSource | null;
    if (row === null) {
      throw new PaymentSourceNotFoundError(id);
    }
    return {
      keyId: row.razorpayKeyId,
      keySecret:
        row.razorpayKeySecretEnc === null
          ? null
          : this.cryptoService.openString(row.razorpayKeySecretEnc),
      webhookSecret:
        row.razorpayWebhookSecretEnc === null
          ? null
          : this.cryptoService.openString(row.razorpayWebhookSecretEnc),
    };
  }
}

interface RawPaymentSource {
  id: string;
  sourceType: PaymentSourceTypeValue;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  razorpayKeyId: string | null;
  razorpayKeySecretEnc: string | null;
  razorpayWebhookSecretEnc: string | null;
  upiHandle: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
  bankAccountHolder: string | null;
  instructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(row: RawPaymentSource): PaymentSourceRow {
  return {
    id: row.id,
    sourceType: row.sourceType,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    isDefault: row.isDefault,
    priority: row.priority,
    razorpayKeyId: row.razorpayKeyId,
    hasRazorpaySecret: row.razorpayKeySecretEnc !== null,
    hasRazorpayWebhookSecret: row.razorpayWebhookSecretEnc !== null,
    upiHandle: row.upiHandle,
    bankName: row.bankName,
    bankAccountNumber: row.bankAccountNumber,
    bankIfsc: row.bankIfsc,
    bankBranch: row.bankBranch,
    bankAccountHolder: row.bankAccountHolder,
    instructions: row.instructions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
