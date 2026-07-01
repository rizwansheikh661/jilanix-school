/**
 * RequestContextMiddleware — runs FIRST on every HTTP request (before
 * controllers, guards, interceptors, and even Nest's own logger
 * middleware). It:
 *
 *   1. Reads `X-Request-Id` (or generates a ULID if absent).
 *   2. Echoes the id back as `X-Request-Id` on the response.
 *   3. Extracts the `traceparent` trace-id (W3C) if present.
 *   4. Reads `X-Client-Name`, `X-Client-Version`, `User-Agent`, IP, locale,
 *      route, method.
 *   5. Wraps `next()` in `RequestContextRegistry.run(ctx, …)` so every
 *      downstream handler — controller, service, Prisma extension, queue
 *      enqueue — sees the same context via AsyncLocalStorage.
 *
 * Auth (`schoolId`, `userId`, `roleIds`, `permissions`) is intentionally
 * NOT populated here. The auth middleware (Module 8) will *upgrade* the
 * context once JWT verification succeeds — see
 * `RequestContextRegistry.inherit()`.
 *
 * The middleware also attaches the id onto `req.id` so pino-http reuses it
 * via `genReqId`. If pino-http already ran (because LoggerModule was
 * registered first), `req.id` is preserved and reused — no double
 * generation.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  CLIENT_NAME_HEADER,
  CLIENT_VERSION_HEADER,
  REQUEST_ID_HEADER,
  REQUEST_ID_HEADER_OUT,
  TRACEPARENT_HEADER,
  extractTraceId,
  normaliseRequestId,
} from '../logger/correlation';
import { RequestContextRegistry, type RequestContext } from './request-context.service';

type RequestWithId = Request & { id?: string };

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function extractIp(req: Request): string | undefined {
  // `trust proxy` enables `req.ip` to honour `X-Forwarded-For`. When the
  // proxy chain is misconfigured, fall back to the connection remote address.
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

function extractLocale(req: Request): string | undefined {
  const headerVal = firstHeader(req.headers['accept-language']);
  if (headerVal === undefined) {
    return undefined;
  }
  // Take the highest-quality tag only — full language negotiation lives in
  // the i18n module (Sprint 4+).
  return headerVal.split(',')[0]?.split(';')[0]?.trim() || undefined;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  public use(req: Request, res: Response, next: NextFunction): void {
    const reqWithId = req as RequestWithId;
    const existing = reqWithId.id;
    const headerVal = firstHeader(req.headers[REQUEST_ID_HEADER]);
    const requestId = existing ?? normaliseRequestId(headerVal);
    reqWithId.id = requestId;

    if (!res.headersSent && !res.getHeader(REQUEST_ID_HEADER_OUT)) {
      res.setHeader(REQUEST_ID_HEADER_OUT, requestId);
    }

    const ctx: RequestContext = Object.freeze({
      requestId,
      traceId: extractTraceId(firstHeader(req.headers[TRACEPARENT_HEADER])),
      actorScope: 'public',
      roleIds: Object.freeze([]),
      permissions: Object.freeze([]),
      ip: extractIp(req),
      userAgent: firstHeader(req.headers['user-agent']),
      clientName: firstHeader(req.headers[CLIENT_NAME_HEADER]),
      clientVersion: firstHeader(req.headers[CLIENT_VERSION_HEADER]),
      route: req.originalUrl?.split('?')[0] ?? req.url?.split('?')[0],
      method: req.method,
      locale: extractLocale(req),
      meta: Object.freeze({}),
    });

    RequestContextRegistry.run(ctx, () => next());
  }
}
