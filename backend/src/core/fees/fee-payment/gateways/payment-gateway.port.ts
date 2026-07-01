/**
 * PaymentGatewayPort — abstraction for external payment gateways.
 *
 * Adapters (Razorpay/PhonePe/Paytm/Stripe) implement this port and
 * self-register in PaymentGatewayRegistry. In Sprint 9 the adapters are
 * stubs that throw PaymentGatewayNotImplementedError; consumers
 * (FeePaymentService.checkout, webhook controller) land in a later wave.
 */
export type GatewayCode = 'razorpay' | 'phonepe' | 'paytm' | 'stripe' | 'cashfree';

export interface CreateCheckoutInput {
  readonly schoolId: string;
  readonly studentId: string;
  readonly invoiceIds: readonly string[];
  readonly amount: number;
  readonly currency: string;
  readonly notes?: Record<string, string>;
  readonly returnUrl?: string;
}

export interface CheckoutSession {
  readonly gatewayCode: GatewayCode;
  readonly sessionId: string;
  readonly redirectUrl: string;
  readonly expiresAt: Date;
}

export interface LookupResult {
  readonly externalId: string;
  readonly status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  readonly amount: number;
  readonly capturedAt: Date | null;
  readonly raw: Record<string, unknown>;
}

export interface WebhookVerification {
  readonly verified: boolean;
  readonly event: string;
  readonly externalId: string;
  readonly amount: number;
  readonly raw: Record<string, unknown>;
}

export interface PaymentGatewayPort {
  readonly code: GatewayCode;
  readonly featureFlagKey: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(payload: unknown, signature: string | null): Promise<WebhookVerification>;
  lookupPayment(externalId: string): Promise<LookupResult>;
}
