/**
 * PaymentSourceService — platform-wide payment source configurations
 * (Razorpay / UPI / Bank / Manual). Reads expose the public shape (boolean
 * presence flags for secrets); only `getDecryptedSecrets` returns plaintext
 * and is meant for the Razorpay client + webhook verification path.
 *
 * Writes are gated by `module.billing` plus, when wiring Razorpay,
 * `billing.razorpay_enabled`. Each mutation lands an outbox event
 * (PAYMENT_SOURCE_CONFIGURED / PAYMENT_SOURCE_DISABLED) and a tenancy audit.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { BillingOutboxTopics } from '../billing.constants';
import {
  NoActivePaymentSourceError,
  PaymentSourceNotFoundError,
} from '../billing.errors';
import { assertBillingEnabled, assertRazorpayEnabled } from '../billing.shared';
import type { PaymentSourceRow, PaymentSourceTypeValue } from '../billing.types';
import {
  PaymentSourceRepository,
  type CreatePaymentSourceInput,
  type ListPaymentSourcesArgs,
  type RazorpaySecrets,
  type UpdatePaymentSourceInput,
} from './payment-source.repository';

@Injectable()
export class PaymentSourceService {
  private readonly logger = new Logger(PaymentSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PaymentSourceRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async get(id: string): Promise<PaymentSourceRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new PaymentSourceNotFoundError(id);
    return row;
  }

  public async list(args: ListPaymentSourcesArgs): Promise<{
    readonly items: readonly PaymentSourceRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.list(args);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  /**
   * Resolve the active Razorpay source — used by RazorpayClientFactory when
   * creating orders or verifying webhooks. Returns the highest-priority
   * active row.
   */
  public async getActiveRazorpaySource(): Promise<PaymentSourceRow> {
    const rows = await this.repo.findActiveByType('RAZORPAY');
    const first = rows[0];
    if (first === undefined) throw new NoActivePaymentSourceError('RAZORPAY');
    return first;
  }

  /**
   * Return plaintext Razorpay secrets for a given source row. This is the
   * ONLY method that ever exposes the sealed values; callers MUST use them
   * for outbound Razorpay traffic only.
   */
  public async getDecryptedSecrets(id: string): Promise<RazorpaySecrets> {
    return this.repo.getRazorpaySecrets(id);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public async create(input: CreatePaymentSourceInput): Promise<PaymentSourceRow> {
    await assertBillingEnabled(this.featureFlags, null);
    if (input.sourceType === 'RAZORPAY') {
      await assertRazorpayEnabled(this.featureFlags, null);
    }

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const created = await this.repo.create(input, tx);
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_SOURCE_CONFIGURED,
        eventType: 'PaymentSourceConfigured',
        aggregateType: 'PaymentSourceConfiguration',
        aggregateId: created.id,
        schoolId: null,
        payload: {
          sourceId: created.id,
          sourceType: created.sourceType,
          name: created.name,
          isActive: created.isActive,
          isDefault: created.isDefault,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment_source.created',
          category: 'tenancy',
          resourceType: 'PaymentSourceConfiguration',
          resourceId: created.id,
          after: created,
          sensitiveFields: ['razorpayKeySecret', 'razorpayWebhookSecret'],
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `PaymentSource created id=${created.id} type=${created.sourceType} name="${created.name}".`,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePaymentSourceInput,
  ): Promise<PaymentSourceRow> {
    await assertBillingEnabled(this.featureFlags, null);
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentSourceNotFoundError(id);
    if (
      existing.sourceType === 'RAZORPAY' &&
      (patch.razorpayKeyId !== undefined ||
        patch.razorpayKeySecret !== undefined ||
        patch.razorpayWebhookSecret !== undefined)
    ) {
      await assertRazorpayEnabled(this.featureFlags, null);
    }

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(id, expectedVersion, patch, tx);
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_SOURCE_CONFIGURED,
        eventType: 'PaymentSourceUpdated',
        aggregateType: 'PaymentSourceConfiguration',
        aggregateId: updated.id,
        schoolId: null,
        payload: {
          sourceId: updated.id,
          sourceType: updated.sourceType,
          isActive: updated.isActive,
          isDefault: updated.isDefault,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment_source.updated',
          category: 'tenancy',
          resourceType: 'PaymentSourceConfiguration',
          resourceId: updated.id,
          before: existing,
          after: updated,
          sensitiveFields: ['razorpayKeySecret', 'razorpayWebhookSecret'],
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  /**
   * Soft-disable a payment source. Implemented as `update({ isActive: false })`
   * + DISABLED outbox topic so consumers can clear caches / fail open flows.
   */
  public async disable(id: string, expectedVersion: number): Promise<PaymentSourceRow> {
    await assertBillingEnabled(this.featureFlags, null);
    const existing = await this.repo.findById(id);
    if (existing === null) throw new PaymentSourceNotFoundError(id);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const updated = await this.repo.update(
        id,
        expectedVersion,
        { isActive: false, isDefault: false },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_SOURCE_DISABLED,
        eventType: 'PaymentSourceDisabled',
        aggregateType: 'PaymentSourceConfiguration',
        aggregateId: updated.id,
        schoolId: null,
        payload: {
          sourceId: updated.id,
          sourceType: updated.sourceType,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.payment_source.disabled',
          category: 'tenancy',
          resourceType: 'PaymentSourceConfiguration',
          resourceId: updated.id,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`PaymentSource disabled id=${id} type=${existing.sourceType}.`);
      return updated;
    });
  }

  /** Convenience for callers that want any active source of a given type. */
  public async findActiveByType(
    sourceType: PaymentSourceTypeValue,
  ): Promise<readonly PaymentSourceRow[]> {
    return this.repo.findActiveByType(sourceType);
  }
}
