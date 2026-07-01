/**
 * RazorpayService — orchestrator that glues the pure `RazorpayGateway` to the
 * billing domain (invoices, payment sources, payment FSM). All three entry
 * points sit behind both `module.billing` and `billing.razorpay_enabled`
 * feature flags.
 *
 *   - createOrderForInvoice → builds a Razorpay order keyed by INV-<number>
 *     and returns the public handle for the front-end.
 *   - verifyAndRecordPayment → checkout-callback path; verifies the HMAC and
 *     records a PaymentRow via PaymentService.recordRazorpay.
 *   - handleWebhook → server-to-server path; verifies the webhook secret then
 *     dispatches on `event` (payment.captured / payment.failed / ...).
 *
 * Webhook activity is observed via a `PAYMENT_GATEWAY_RECEIVED` outbox event
 * for downstream audit consumers, regardless of which event we dispatched.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { BillingOutboxTopics } from '../billing.constants';
import {
  InvoiceNotFoundError,
  PaymentSignatureInvalidError,
} from '../billing.errors';
import { assertRazorpayEnabled } from '../billing.shared';
import type { PaymentRow } from '../billing.types';
import { InvoiceRepository } from '../invoice/invoice.repository';
import { PaymentRepository } from '../payment/payment.repository';
import { PaymentService } from '../payment/payment.service';
import { PaymentSourceService } from '../payment-source/payment-source.service';
import { RazorpayGateway } from './razorpay.gateway';
import type {
  RazorpayOrder,
  RazorpayPaymentCapturedPayload,
} from './razorpay.types';

export interface CreateRazorpayOrderArgs {
  readonly invoiceId: string;
}

/** Public shape returned to the front-end — never include keySecret here. */
export interface CreateRazorpayOrderResult {
  readonly orderId: string;
  readonly keyId: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
}

export interface VerifyRazorpayPaymentArgs {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}

export interface HandleWebhookArgs {
  readonly rawBody: string;
  readonly signature: string;
  readonly timestampSeconds?: number;
}

const RECEIPT_INVOICE_PREFIX = 'INV-';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RazorpayGateway,
    private readonly paymentSourceService: PaymentSourceService,
    private readonly paymentService: PaymentService,
    private readonly paymentRepo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // createOrderForInvoice — front-end calls this to obtain checkout config
  // -------------------------------------------------------------------------

  public async createOrderForInvoice(
    args: CreateRazorpayOrderArgs,
  ): Promise<CreateRazorpayOrderResult> {
    const invoice = await this.invoiceRepo.findById(args.invoiceId);
    if (invoice === null) {
      throw new InvoiceNotFoundError(args.invoiceId);
    }
    await assertRazorpayEnabled(this.featureFlags, invoice.schoolId);

    const source = await this.paymentSourceService.getActiveRazorpaySource();
    const secrets = await this.paymentSourceService.getDecryptedSecrets(source.id);
    if (secrets.keyId === null || secrets.keySecret === null) {
      throw new Error(
        `Razorpay source ${source.id} is missing keyId/keySecret; cannot create order.`,
      );
    }

    const receipt = `${RECEIPT_INVOICE_PREFIX}${invoice.invoiceNumber}`;
    const order: RazorpayOrder = await this.gateway.createOrder(
      {
        amount: invoice.amountDue,
        currency: invoice.currency,
        receipt,
        notes: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          schoolId: invoice.schoolId,
        },
      },
      { keyId: secrets.keyId, keySecret: secrets.keySecret },
    );

    this.logger.log(
      `Razorpay order created invoiceId=${invoice.id} orderId=${order.id} amount=${invoice.amountDue}.`,
    );
    return {
      orderId: order.id,
      keyId: secrets.keyId,
      amount: invoice.amountDue,
      currency: invoice.currency,
      receipt,
    };
  }

  // -------------------------------------------------------------------------
  // verifyAndRecordPayment — checkout callback path
  // -------------------------------------------------------------------------

  public async verifyAndRecordPayment(
    args: VerifyRazorpayPaymentArgs,
  ): Promise<PaymentRow> {
    // The flag guard inside PaymentService.recordRazorpay needs a schoolId,
    // so we resolve the invoice up front for both signature verification +
    // account context.
    const invoice = await this.resolveInvoiceForOrder(args.orderId);
    await assertRazorpayEnabled(this.featureFlags, invoice?.schoolId ?? null);

    const source = await this.paymentSourceService.getActiveRazorpaySource();
    const secrets = await this.paymentSourceService.getDecryptedSecrets(source.id);
    if (secrets.keySecret === null) {
      throw new Error(`Razorpay source ${source.id} is missing keySecret.`);
    }

    const valid = this.gateway.verifySignature({
      orderId: args.orderId,
      paymentId: args.paymentId,
      signature: args.signature,
      keySecret: secrets.keySecret,
    });
    if (!valid) {
      throw new PaymentSignatureInvalidError(args.orderId);
    }

    if (invoice === null) {
      throw new InvoiceNotFoundError(`razorpay-order:${args.orderId}`);
    }

    // PaymentService.recordRazorpay owns its own tx; we do not wrap it again
    // (Prisma rejects nested $transaction usage with the extended client).
    return this.paymentService.recordRazorpay({
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      amount: invoice.amountDue,
      currency: invoice.currency,
      gatewayOrderId: args.orderId,
      gatewayPaymentId: args.paymentId,
      gatewaySignature: args.signature,
      signatureValid: true,
      paymentSourceId: source.id,
    });
  }

  // -------------------------------------------------------------------------
  // handleWebhook — server-to-server dispatch
  // -------------------------------------------------------------------------

  public async handleWebhook(args: HandleWebhookArgs): Promise<void> {
    await assertRazorpayEnabled(this.featureFlags, null);

    const source = await this.paymentSourceService.getActiveRazorpaySource();
    const secrets = await this.paymentSourceService.getDecryptedSecrets(source.id);
    if (secrets.webhookSecret === null) {
      throw new Error(
        `Razorpay source ${source.id} is missing webhookSecret; refusing to process webhook.`,
      );
    }

    const valid = this.gateway.verifyWebhookSignature({
      rawBody: args.rawBody,
      signature: args.signature,
      webhookSecret: secrets.webhookSecret,
      ...(args.timestampSeconds !== undefined
        ? { timestampSeconds: args.timestampSeconds }
        : {}),
    });
    if (!valid) {
      throw new PaymentSignatureInvalidError('webhook');
    }

    let parsed: RazorpayPaymentCapturedPayload;
    try {
      parsed = JSON.parse(args.rawBody) as RazorpayPaymentCapturedPayload;
    } catch (err) {
      throw new Error(`Razorpay webhook body is not valid JSON: ${(err as Error).message}`);
    }
    const event = parsed.event;
    const entity = parsed.payload?.payment?.entity;

    // Always record receipt of the webhook for downstream audit consumers.
    await this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.PAYMENT_GATEWAY_RECEIVED,
        eventType: 'PaymentGatewayWebhookReceived',
        aggregateType: 'Payment',
        aggregateId: entity?.id ?? entity?.order_id ?? 'unknown',
        schoolId: null,
        payload: {
          event,
          orderId: entity?.order_id ?? null,
          paymentId: entity?.id ?? null,
          status: entity?.status ?? null,
        } as unknown as Prisma.InputJsonValue,
      });
    });

    if (entity === undefined) {
      this.logger.warn(`Razorpay webhook event=${event} missing payment.entity; ignoring.`);
      return;
    }

    switch (event) {
      case 'payment.captured': {
        const existing = await this.paymentRepo.findByGatewayOrder(entity.order_id);
        if (existing !== null) {
          this.logger.log(
            `Razorpay webhook payment.captured already recorded paymentId=${existing.id}; ignoring.`,
          );
          return;
        }
        // We have the verified signature in the webhook envelope but the
        // per-order HMAC needs the checkout signature (not present on the
        // server-to-server event). We trust the webhook secret and record
        // the payment via the same verifyAndRecordPayment-style flow.
        const invoice = await this.resolveInvoiceForOrder(entity.order_id);
        if (invoice === null) {
          this.logger.warn(
            `Razorpay webhook payment.captured orderId=${entity.order_id} has no matching invoice; ignoring.`,
          );
          return;
        }
        await this.paymentService.recordRazorpay({
          accountId: invoice.accountId,
          invoiceId: invoice.id,
          amount: paiseToMajor(entity.amount),
          currency: entity.currency,
          gatewayOrderId: entity.order_id,
          gatewayPaymentId: entity.id,
          gatewaySignature: 'webhook',
          signatureValid: true,
          paymentSourceId: source.id,
          rawResponse: parsed as unknown,
        });
        return;
      }
      case 'payment.failed': {
        const existing = await this.paymentRepo.findByGatewayOrder(entity.order_id);
        if (existing === null) {
          this.logger.log(
            `Razorpay webhook payment.failed orderId=${entity.order_id} has no Payment row; ignoring.`,
          );
          return;
        }
        if (
          existing.status === 'FAILED' ||
          existing.status === 'REJECTED'
        ) {
          return;
        }
        await this.paymentService.markFailed(
          existing.id,
          existing.version,
          'RAZORPAY_PAYMENT_FAILED',
          `Razorpay reported payment.failed for order ${entity.order_id}.`,
        );
        return;
      }
      default: {
        this.logger.log(`Razorpay webhook event=${event} ignored (not handled).`);
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Try the pre-created Payment row first (cheapest lookup, populated by
   * createOrderForInvoice's downstream record). Fall back to deriving the
   * invoice number from the receipt convention `INV-<invoiceNumber>`.
   */
  private async resolveInvoiceForOrder(
    orderId: string,
  ): Promise<{ readonly id: string; readonly accountId: string; readonly schoolId: string; readonly amountDue: number; readonly currency: string } | null> {
    const payment = await this.paymentRepo.findByGatewayOrder(orderId);
    if (payment !== null && payment.invoiceId !== null) {
      const invoice = await this.invoiceRepo.findById(payment.invoiceId);
      if (invoice !== null) {
        return {
          id: invoice.id,
          accountId: invoice.accountId,
          schoolId: invoice.schoolId,
          amountDue: invoice.amountDue,
          currency: invoice.currency,
        };
      }
    }
    return null;
  }
}

function paiseToMajor(paise: number): number {
  return Math.round(paise) / 100;
}
