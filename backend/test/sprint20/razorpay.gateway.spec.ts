/**
 * RazorpayGateway unit specs — Sprint 20 W11.
 *
 * Critical paths:
 *   - verifySignature() with a valid HMAC returns true; tampered signature
 *     returns false.
 *   - verifyWebhookSignature() with a valid HMAC returns true; tampered
 *     signature returns false; expired timestamp (older than the configured
 *     tolerance) returns false.
 */
import { createHmac } from 'node:crypto';

import { RazorpayGateway } from '../../src/core/billing/razorpay/razorpay.gateway';
import { RAZORPAY_WEBHOOK_TOLERANCE_SECONDS } from '../../src/core/billing/billing.constants';

const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';

function hex(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

describe('RazorpayGateway.verifySignature', () => {
  it('returns true for a valid HMAC', () => {
    const gw = new RazorpayGateway();
    const orderId = 'order_X';
    const paymentId = 'pay_X';
    const signature = hex(`${orderId}|${paymentId}`, KEY_SECRET);

    expect(gw.verifySignature({ orderId, paymentId, signature, keySecret: KEY_SECRET })).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    const gw = new RazorpayGateway();
    const orderId = 'order_X';
    const paymentId = 'pay_X';
    const tampered = hex(`${orderId}|other`, KEY_SECRET);

    expect(gw.verifySignature({ orderId, paymentId, signature: tampered, keySecret: KEY_SECRET })).toBe(false);
  });
});

describe('RazorpayGateway.verifyWebhookSignature', () => {
  it('returns true for a valid HMAC and an in-tolerance timestamp', () => {
    const gw = new RazorpayGateway();
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const signature = hex(rawBody, WEBHOOK_SECRET);

    expect(
      gw.verifyWebhookSignature({
        rawBody,
        signature,
        webhookSecret: WEBHOOK_SECRET,
        timestampSeconds: Math.floor(Date.now() / 1000),
      }),
    ).toBe(true);
  });

  it('returns false for a tampered HMAC', () => {
    const gw = new RazorpayGateway();
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const signature = hex(`${rawBody}-tampered`, WEBHOOK_SECRET);
    expect(
      gw.verifyWebhookSignature({ rawBody, signature, webhookSecret: WEBHOOK_SECRET }),
    ).toBe(false);
  });

  it('returns false when the timestamp is older than the tolerance window', () => {
    const gw = new RazorpayGateway();
    const rawBody = '{"event":"payment.captured"}';
    const signature = hex(rawBody, WEBHOOK_SECRET);
    const stale = Math.floor(Date.now() / 1000) - (RAZORPAY_WEBHOOK_TOLERANCE_SECONDS + 60);

    expect(
      gw.verifyWebhookSignature({
        rawBody,
        signature,
        webhookSecret: WEBHOOK_SECRET,
        timestampSeconds: stale,
      }),
    ).toBe(false);
  });
});
