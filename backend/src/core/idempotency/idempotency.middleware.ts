import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextRegistry } from '../request-context';
import { IDEMPOTENCY_HEADER, IDEMPOTENCY_METHODS } from './idempotency.constants';
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from './idempotency.errors';
import { IdempotencyService } from './idempotency.service';

const KEY_MAX_LENGTH = 255;

/**
 * Idempotency middleware. For POST/PUT/PATCH requests carrying an
 * `Idempotency-Key` header:
 *
 *   1. Hash the request (method + path + body) into a fingerprint.
 *   2. Look up an active row scoped to `(tenant, key)`.
 *      - Hit with same fingerprint: replay the stored response verbatim.
 *      - Hit with different fingerprint: 409 conflict.
 *      - Hit but still in_progress: 409 (caller must retry later).
 *   3. Miss: reserve a row, monkey-patch `res.json`/`res.send` to capture
 *      the response, run the handler, and persist the captured payload
 *      with `status='completed'` (or `'failed'` on 5xx).
 *
 * Failures inside the persistence layer are logged but never crash the
 * request — idempotency is a best-effort optimisation on the response
 * cache, not a correctness boundary on the handler itself.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private readonly service: IdempotencyService) {}

  public async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!IDEMPOTENCY_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    const headerValue = req.headers[IDEMPOTENCY_HEADER];
    const key = typeof headerValue === 'string' ? headerValue.trim() : '';
    if (key === '' || key.length > KEY_MAX_LENGTH) {
      return next();
    }

    const ctx = RequestContextRegistry.peek();
    const schoolId = ctx?.schoolId ?? null;

    const fingerprint = this.service.computeFingerprint({
      method: req.method,
      path: req.originalUrl ?? req.url,
      body: (req as { body?: unknown }).body,
    });

    let lookup;
    try {
      lookup = await this.service.lookupOrReserve({ schoolId, key, fingerprint });
    } catch (err) {
      if (
        err instanceof IdempotencyConflictError ||
        err instanceof IdempotencyInProgressError
      ) {
        return next(err);
      }
      this.logger.warn(`Idempotency lookup failed: ${(err as Error).message}`);
      return next();
    }

    if (lookup.kind === 'hit') {
      res.status(lookup.responseStatus);
      res.setHeader('X-Idempotent-Replay', 'true');
      res.json(lookup.responseBody);
      return;
    }

    const reservationId = lookup.id;
    let captured: unknown;
    let didFinalize = false;

    const finalize = (success: boolean): void => {
      if (didFinalize) return;
      didFinalize = true;
      const status = res.statusCode;
      void this.service.complete({
        id: reservationId,
        responseStatus: status,
        responseBody: captured ?? null,
        success: success && status < 500,
      });
    };

    const releaseIfNoBody = (): void => {
      if (didFinalize) return;
      didFinalize = true;
      void this.service.releaseReservation(reservationId);
    };

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (body?: unknown) => {
      captured = body;
      return originalJson(body);
    };

    res.send = (body?: unknown) => {
      if (captured === undefined) {
        try {
          captured = typeof body === 'string' ? JSON.parse(body) : body;
        } catch {
          captured = body;
        }
      }
      return originalSend(body);
    };

    res.on('finish', () => finalize(true));
    res.on('close', () => {
      if (!res.writableEnded) {
        releaseIfNoBody();
      }
    });

    return next();
  }
}
