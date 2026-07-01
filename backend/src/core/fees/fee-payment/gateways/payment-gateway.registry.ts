/**
 * PaymentGatewayRegistry — runtime lookup for PaymentGatewayPort adapters.
 *
 * Adapters self-register in their constructor (canonical NestJS plugin pattern,
 * since Nest instantiates all providers on boot). `resolve` enforces the
 * per-tenant feature flag before returning the adapter so disabled gateways
 * cannot be used even if their adapter is wired in.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../../feature-flag/services/feature-flag.service';
import {
  PaymentGatewayDisabledError,
  PaymentGatewayUnknownError,
} from '../../fees.errors';

import type { GatewayCode, PaymentGatewayPort } from './payment-gateway.port';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly adapters = new Map<GatewayCode, PaymentGatewayPort>();

  constructor(private readonly featureFlags: FeatureFlagService) {}

  public register(adapter: PaymentGatewayPort): void {
    this.adapters.set(adapter.code, adapter);
  }

  public async resolve(
    code: GatewayCode,
    schoolId: string | null,
  ): Promise<PaymentGatewayPort> {
    const adapter = this.adapters.get(code);
    if (adapter === undefined) throw new PaymentGatewayUnknownError(code);
    const enabled = await this.featureFlags.isEnabled(adapter.featureFlagKey, { schoolId });
    if (!enabled) throw new PaymentGatewayDisabledError(code);
    return adapter;
  }

  public list(): readonly GatewayCode[] {
    return [...this.adapters.keys()];
  }
}
