/**
 * Paytm adapter — Sprint 9 stub. All methods throw
 * PaymentGatewayNotImplementedError. Self-registers in the registry.
 */
import { Injectable } from '@nestjs/common';

import { FeesFeatureFlags } from '../../../fees.constants';
import { PaymentGatewayNotImplementedError } from '../../../fees.errors';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  LookupResult,
  PaymentGatewayPort,
  WebhookVerification,
} from '../payment-gateway.port';
import { PaymentGatewayRegistry } from '../payment-gateway.registry';

@Injectable()
export class PaytmAdapter implements PaymentGatewayPort {
  public readonly code = 'paytm' as const;
  public readonly featureFlagKey = FeesFeatureFlags.GATEWAY_PAYTM;

  constructor(registry: PaymentGatewayRegistry) {
    registry.register(this);
  }

  public createCheckout(_input: CreateCheckoutInput): Promise<CheckoutSession> {
    throw new PaymentGatewayNotImplementedError(this.code);
  }

  public verifyWebhook(_payload: unknown, _signature: string | null): Promise<WebhookVerification> {
    throw new PaymentGatewayNotImplementedError(this.code);
  }

  public lookupPayment(_externalId: string): Promise<LookupResult> {
    throw new PaymentGatewayNotImplementedError(this.code);
  }
}
