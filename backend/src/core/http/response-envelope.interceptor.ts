/**
 * ResponseEnvelopeInterceptor — wraps every controller success return
 * value in `{ data, meta: { requestId } }` per API_STANDARDS §6/§7.
 *
 * Skipped for:
 *   - Probe paths in `ENVELOPE_EXEMPT_PATHS` (they ship raw bodies).
 *   - Returns that already look like a `SuccessEnvelope` — i.e. a
 *     controller chose to construct its own envelope (e.g. paginated
 *     lists that need richer `meta`). In that case we still merge in
 *     `requestId` so callers don't have to.
 *
 * Errors flow through the GlobalExceptionFilter, not this interceptor.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, map } from 'rxjs';

import {
  isSuccessEnvelope,
  type SuccessEnvelope,
  type SuccessMeta,
} from '../../contracts/api';
import { RequestContextRegistry } from '../request-context/request-context.service';
import { isEnvelopeExemptPath } from './envelope-exempt';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (isEnvelopeExemptPath(req.path)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((value: unknown): SuccessEnvelope<unknown> => {
        const requestId = RequestContextRegistry.peek()?.requestId ?? 'unknown';
        if (isSuccessEnvelope(value)) {
          const meta: SuccessMeta = { ...value.meta, requestId };
          return { data: value.data, meta };
        }
        return { data: value, meta: { requestId } };
      }),
    );
  }
}
