/**
 * PaymentGatewayRegistry unit spec — adapter registration, feature-flag
 * gating on resolve, unknown-code rejection, and stub-adapter
 * not-implemented invariants.
 */
import { FeesFeatureFlags } from '../../fees.constants';
import {
  PaymentGatewayDisabledError,
  PaymentGatewayNotImplementedError,
  PaymentGatewayUnknownError,
} from '../../fees.errors';
import { PaytmAdapter } from './adapters/paytm.adapter';
import { PhonePeAdapter } from './adapters/phonepe.adapter';
import { RazorpayAdapter } from './adapters/razorpay.adapter';
import { StripeAdapter } from './adapters/stripe.adapter';
import type { PaymentGatewayPort } from './payment-gateway.port';
import { PaymentGatewayRegistry } from './payment-gateway.registry';

function stubAdapter(code: 'razorpay'): PaymentGatewayPort {
  return {
    code,
    featureFlagKey: FeesFeatureFlags.GATEWAY_RAZORPAY,
    createCheckout: jest.fn(),
    verifyWebhook: jest.fn(),
    lookupPayment: jest.fn(),
  };
}

describe('PaymentGatewayRegistry.register', () => {
  it('stores the adapter keyed by code', () => {
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const registry = new PaymentGatewayRegistry(featureFlags as never);
    const adapter = stubAdapter('razorpay');
    registry.register(adapter);
    expect(registry.list()).toEqual(['razorpay']);
  });
});

describe('PaymentGatewayRegistry.resolve', () => {
  it('throws PaymentGatewayDisabledError when feature flag returns false', async () => {
    const featureFlags = { isEnabled: jest.fn(async () => false) };
    const registry = new PaymentGatewayRegistry(featureFlags as never);
    registry.register(stubAdapter('razorpay'));
    await expect(registry.resolve('razorpay', 'school-1')).rejects.toBeInstanceOf(
      PaymentGatewayDisabledError,
    );
    expect(featureFlags.isEnabled).toHaveBeenCalledWith(
      FeesFeatureFlags.GATEWAY_RAZORPAY,
      { schoolId: 'school-1' },
    );
  });

  it('returns the adapter when feature flag returns true', async () => {
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const registry = new PaymentGatewayRegistry(featureFlags as never);
    const adapter = stubAdapter('razorpay');
    registry.register(adapter);
    await expect(registry.resolve('razorpay', 'school-1')).resolves.toBe(adapter);
  });

  it('throws PaymentGatewayUnknownError when code is not registered', async () => {
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const registry = new PaymentGatewayRegistry(featureFlags as never);
    await expect(
      registry.resolve('unknown' as never, 'school-1'),
    ).rejects.toBeInstanceOf(PaymentGatewayUnknownError);
  });
});

describe('stub adapters — all gateway methods throw not-implemented', () => {
  const adapters = [
    () => new RazorpayAdapter({ register: jest.fn() } as never),
    () => new PhonePeAdapter({ register: jest.fn() } as never),
    () => new PaytmAdapter({ register: jest.fn() } as never),
    () => new StripeAdapter({ register: jest.fn() } as never),
  ];

  it.each(adapters)('createCheckout throws PaymentGatewayNotImplementedError', (factory) => {
    const adapter = factory();
    expect(() =>
      adapter.createCheckout({
        schoolId: 'school-1',
        studentId: 'st-1',
        invoiceIds: ['inv-1'],
        amount: 100,
        currency: 'INR',
      }),
    ).toThrow(PaymentGatewayNotImplementedError);
  });

  it.each(adapters)('verifyWebhook throws PaymentGatewayNotImplementedError', (factory) => {
    const adapter = factory();
    expect(() => adapter.verifyWebhook({}, null)).toThrow(
      PaymentGatewayNotImplementedError,
    );
  });

  it.each(adapters)('lookupPayment throws PaymentGatewayNotImplementedError', (factory) => {
    const adapter = factory();
    expect(() => adapter.lookupPayment('ext-1')).toThrow(
      PaymentGatewayNotImplementedError,
    );
  });
});
