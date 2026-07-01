/**
 * Razorpay gateway type shapes — input/output contracts for the pure-adapter
 * `RazorpayGateway` (no DB, no Nest deps beyond Logger). Keeps the gateway's
 * surface area explicit and SDK-free.
 */

export interface RazorpayOrder {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly status: string;
  readonly created_at: number;
}

export interface RazorpayCreateOrderInput {
  /** Amount in the major unit (e.g. INR rupees). Converted to paise on send. */
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly notes?: Record<string, string> | null;
}

export interface RazorpayPaymentEntity {
  readonly id: string;
  readonly order_id: string;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
  readonly [extra: string]: unknown;
}

export interface RazorpayPaymentCapturedPayload {
  readonly event: string;
  readonly payload: {
    readonly payment: {
      readonly entity: RazorpayPaymentEntity;
    };
  };
}

export interface RazorpayVerifySignatureInput {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
  readonly keySecret: string;
}

export interface RazorpayVerifyWebhookInput {
  readonly rawBody: string;
  readonly signature: string;
  readonly webhookSecret: string;
  /** Optional epoch seconds for replay protection. */
  readonly timestampSeconds?: number;
}
