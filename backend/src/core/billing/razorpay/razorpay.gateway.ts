/**
 * RazorpayGateway — pure HTTPS+HMAC adapter for the Razorpay REST API and
 * webhook signature verification. No DB, no Nest providers beyond `Logger`,
 * no external dependencies (uses Node's built-in `https` and `crypto`).
 *
 * Surface:
 *   - `createOrder(input, { keyId, keySecret })` — POST /v1/orders with HTTP
 *     Basic auth.
 *   - `verifySignature(input)` — HMAC-SHA256 of `${orderId}|${paymentId}` with
 *     `keySecret`, timing-safe compare to the supplied signature.
 *   - `verifyWebhookSignature(input)` — HMAC-SHA256 of the raw body with the
 *     webhook secret, timing-safe compare, optional timestamp tolerance.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

import {
  RAZORPAY_API_BASE,
  RAZORPAY_WEBHOOK_TOLERANCE_SECONDS,
} from '../billing.constants';
import type {
  RazorpayCreateOrderInput,
  RazorpayOrder,
  RazorpayVerifySignatureInput,
  RazorpayVerifyWebhookInput,
} from './razorpay.types';

export interface RazorpayCredentials {
  readonly keyId: string;
  readonly keySecret: string;
}

@Injectable()
export class RazorpayGateway {
  private readonly logger = new Logger(RazorpayGateway.name);

  // -------------------------------------------------------------------------
  // createOrder — POST /v1/orders (HTTP Basic with keyId:keySecret)
  // -------------------------------------------------------------------------

  public async createOrder(
    input: RazorpayCreateOrderInput,
    creds: RazorpayCredentials,
  ): Promise<RazorpayOrder> {
    const url = new URL(`${RAZORPAY_API_BASE}/orders`);
    const body = JSON.stringify({
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      receipt: input.receipt,
      ...(input.notes !== undefined && input.notes !== null ? { notes: input.notes } : {}),
    });
    const basic = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');

    const { statusCode, responseBody } = await this.httpsPost(url, body, {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    });
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(
        `Razorpay createOrder failed: status=${statusCode} body=${responseBody.slice(0, 500)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseBody);
    } catch (err) {
      throw new Error(
        `Razorpay createOrder failed: invalid JSON response (${(err as Error).message}).`,
      );
    }
    const order = parsed as Partial<RazorpayOrder> & { amount?: number | string };
    if (
      typeof order.id !== 'string' ||
      typeof order.currency !== 'string' ||
      typeof order.status !== 'string'
    ) {
      throw new Error(
        `Razorpay createOrder failed: malformed order shape (body=${responseBody.slice(0, 300)}).`,
      );
    }
    return {
      id: order.id,
      amount: typeof order.amount === 'string' ? Number(order.amount) : (order.amount ?? 0),
      currency: order.currency,
      receipt: order.receipt ?? input.receipt,
      status: order.status,
      created_at: order.created_at ?? Math.floor(Date.now() / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // verifySignature — HMAC-SHA256(`${orderId}|${paymentId}`, keySecret)
  // -------------------------------------------------------------------------

  public verifySignature(input: RazorpayVerifySignatureInput): boolean {
    const expected = createHmac('sha256', input.keySecret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');
    return safeHexEqual(expected, input.signature);
  }

  // -------------------------------------------------------------------------
  // verifyWebhookSignature — HMAC-SHA256(rawBody, webhookSecret) + optional
  // replay protection via timestamp tolerance.
  // -------------------------------------------------------------------------

  public verifyWebhookSignature(input: RazorpayVerifyWebhookInput): boolean {
    if (input.timestampSeconds !== undefined) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - input.timestampSeconds) > RAZORPAY_WEBHOOK_TOLERANCE_SECONDS) {
        this.logger.warn(
          `Webhook timestamp out of tolerance: now=${nowSec} ts=${input.timestampSeconds}.`,
        );
        return false;
      }
    }
    const expected = createHmac('sha256', input.webhookSecret)
      .update(input.rawBody)
      .digest('hex');
    return safeHexEqual(expected, input.signature);
  }

  // -------------------------------------------------------------------------
  // Internals — minimal HTTPS POST helper (Node built-in `https`).
  // -------------------------------------------------------------------------

  private httpsPost(
    url: URL,
    body: string,
    headers: Record<string, string>,
  ): Promise<{ readonly statusCode: number; readonly responseBody: string }> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          method: 'POST',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port === '' ? 443 : Number(url.port),
          path: `${url.pathname}${url.search}`,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              responseBody: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );
      req.on('error', (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}

/**
 * Timing-safe equality on two hex strings of equal length. Returns false on
 * length mismatch without leaking timing information for matched-length
 * comparisons.
 */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'hex');
    bufB = Buffer.from(b, 'hex');
  } catch {
    return false;
  }
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
