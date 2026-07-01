/**
 * AuditInterceptor — bridges the `@Audit({...})` decorator (and class-level
 * `@AuditCategory`) into `AuditService.record(...)`.
 *
 * Where it runs:
 *   Register on a controller, a service method, or globally. The
 *   interceptor:
 *     1. Reads `@Audit` metadata. If absent, it's a no-op.
 *     2. Runs the wrapped handler.
 *     3. On success, builds an `AuditEvent` from method args + return
 *        value and calls `auditService.record(...)`.
 *     4. On error, does NOT write an audit row (the business write
 *        rolled back; audit a non-event would mislead).
 *
 * Sprint 1 limitation:
 *   The interceptor records audit events autonomously — i.e. NOT inside
 *   the service's transaction. That weakens the same-tx atomicity rule
 *   from BACKEND_ARCHITECTURE §11.2. Once the transactional interceptor
 *   from Module 14 part 2 lands, we'll wrap handler execution in a tx
 *   and pass it through to `record(event, { tx })`. Until then, services
 *   that need same-tx audit must call `auditService.record(event, { tx })`
 *   themselves inside their `prisma.transaction(...)` block.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';

import { AppLogger } from '../logger';
import { AUDIT_CATEGORY_META, AUDIT_META, type AuditMeta } from './audit.decorator';
import { AuditService } from './audit.service';
import type { AuditCategory, AuditEvent } from './audit.types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AuditInterceptor');
  }

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_META, context.getHandler());
    if (meta === undefined) {
      return next.handle();
    }
    const classCategory = this.reflector.get<AuditCategory | undefined>(
      AUDIT_CATEGORY_META,
      context.getClass(),
    );
    const category = meta.category ?? classCategory ?? 'general';
    const args = context.getArgs();

    return next.handle().pipe(
      tap({
        next: (result) => {
          const event = this.buildEvent(meta, category, args, result);
          // Fire-and-forget so the response isn't delayed by audit IO.
          // Failures land in the structured log; later sprints turn this
          // into a retry queue.
          this.audit.record(event).catch((err: unknown) => {
            this.logger.error('audit.write.failed', {
              err: err as Error,
              action: meta.action,
            });
          });
        },
      }),
    );
  }

  private buildEvent(
    meta: AuditMeta,
    category: AuditCategory,
    args: unknown[],
    result: unknown,
  ): AuditEvent {
    const idPath = meta.idFrom ?? 'return.id';
    const resourceId = resolvePath(idPath, args, result);
    return {
      action: meta.action,
      category,
      resourceType: meta.entityType,
      resourceId,
      after: result,
      sensitiveFields: meta.sensitiveFields,
    };
  }
}

function resolvePath(path: string, args: unknown[], result: unknown): string | undefined {
  const [root, ...rest] = path.split('.');
  let current: unknown;
  if (root === 'return') {
    current = result;
  } else if (root === 'args') {
    const idx = Number(rest.shift());
    if (Number.isNaN(idx) || idx < 0 || idx >= args.length) {
      return undefined;
    }
    current = args[idx];
  } else {
    return undefined;
  }
  for (const key of rest) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}
