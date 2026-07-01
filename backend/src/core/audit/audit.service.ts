/**
 * AuditService — the public audit API.
 *
 * Two entry points:
 *
 *   - `record(event, { tx? })` — write a single audit row, hash-chained,
 *     ideally inside the same transaction as the business write. This is
 *     what services call directly (or implicitly via `@Audit(...)` once
 *     the interceptor lands).
 *
 *   - `flushBufferedIntents({ tx })` — drain the request-scoped buffer
 *     populated by `auditExt` and write each intent as an audit row.
 *     Sprint 1: called by the AuditInterceptor at the end of a request
 *     and by service methods that wrap their own transaction.
 *
 * What gets captured (per AuditEvent → AuditLog row):
 *   - action          (e.g. "student.update", "invoice.refund")
 *   - category        ('general' | 'finance' | 'security' | 'tenancy')
 *   - resourceType + resourceId
 *   - schoolId, actorUserId, impersonatorUserId, actorScope
 *   - before/after diffs with sensitive fields redacted, capped at 64 KiB
 *   - ipAddress, userAgent, requestId
 *   - prevHash + rowHash (computed inside `tx`)
 *
 * Failure mode:
 *   In Sprint 1, audit write failures throw. Once the production retention
 *   story lands (Module 14 part 2), this becomes a SETTING — finance
 *   writes MUST throw; general writes degrade to a structured warn log so
 *   a bad audit row never takes down a successful business op.
 */
import { Injectable } from '@nestjs/common';

import { AppLogger } from '../logger';
import { RequestContextRegistry } from '../request-context';
import { capPayload, diffRows, redactSensitive } from './audit.diff';
import { AuditRecorder } from './audit.recorder';
import type {
  AuditCategory,
  AuditEvent,
  AuditIntent,
  AuditLogCreateInput,
  AuditWriteOptions,
} from './audit.types';
import { FinanceChainService } from './finance-chain/chain.service';
import { AuditRepository } from './repositories/audit.repository';

@Injectable()
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly chain: FinanceChainService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AuditService');
  }

  public async record(event: AuditEvent, options: AuditWriteOptions = {}): Promise<{ id: string; rowHash: string }> {
    const ctx = RequestContextRegistry.peek();
    const schoolId = event.schoolId ?? ctx?.schoolId ?? null;
    const sensitiveFields = event.sensitiveFields ?? [];

    const diff = diffRows(event.before, event.after);
    const beforeCapped = capPayload(redactSensitive(diff.before, sensitiveFields));
    const afterCapped = capPayload(redactSensitive(diff.after, sensitiveFields));

    const createdAt = new Date();
    const baseRow = {
      schoolId,
      category: event.category,
      action: event.action,
      resourceType: event.resourceType ?? null,
      resourceId: event.resourceId ?? null,
      actorUserId: ctx?.userId ?? null,
      actorScope: this.normaliseActorScope(ctx?.actorScope),
      beforeJson: beforeCapped.value,
      afterJson: afterCapped.value,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
      createdAt,
    };

    const writer = options.tx;
    const chainComp = writer
      ? await this.chain.compute(writer, { schoolId, category: event.category }, baseRow)
      : await this.computeWithoutTx({ schoolId, category: event.category }, baseRow);

    const insert: AuditLogCreateInput = {
      schoolId,
      actorUserId: baseRow.actorUserId,
      actorScope: baseRow.actorScope,
      impersonatorUserId: ctx?.impersonatorUserId ?? null,
      action: baseRow.action,
      category: baseRow.category,
      resourceType: baseRow.resourceType,
      resourceId: baseRow.resourceId,
      beforeJson: baseRow.beforeJson,
      afterJson: baseRow.afterJson,
      ipAddress: baseRow.ipAddress,
      userAgent: baseRow.userAgent,
      requestId: baseRow.requestId,
      prevHash: chainComp.prevHash,
      rowHash: chainComp.rowHash,
    };

    const result = await this.repo.insert(insert, writer);

    if (beforeCapped.overflow || afterCapped.overflow) {
      this.logger.warn('audit.payload.overflow', {
        action: event.action,
        category: event.category,
        before_bytes: beforeCapped.originalBytes,
        after_bytes: afterCapped.originalBytes,
      });
    }

    return result;
  }

  /**
   * Drain the per-request intent buffer (populated by `auditExt`) and
   * write each intent as a `general`-category audit row. Resource-type /
   * action come from the model + Prisma operation.
   */
  public async flushBufferedIntents(options: AuditWriteOptions = {}): Promise<number> {
    const intents = AuditRecorder.drain();
    for (const intent of intents) {
      await this.record(this.intentToEvent(intent), options);
    }
    return intents.length;
  }

  private intentToEvent(intent: AuditIntent): AuditEvent {
    return {
      action: `${snakeCase(intent.model)}.${intent.operation}`,
      category: intent.category,
      resourceType: intent.model,
      schoolId: intent.schoolId,
      before: intent.before,
      after: intent.after,
    };
  }

  private normaliseActorScope(scope: string | undefined): string {
    if (scope === undefined) {
      return 'system';
    }
    return scope;
  }

  /**
   * When called without a tx the prev_hash lookup runs outside any lock.
   * That means a concurrent insert could win the race and the chain
   * degrades to "best effort, last writer wins". We log a warning so this
   * path is visible — production callers should always pass `tx`.
   */
  private async computeWithoutTx(
    key: { schoolId: string | null; category: AuditCategory },
    row: Parameters<FinanceChainService['hashRow']>[1],
  ): Promise<{ prevHash: string | null; rowHash: string }> {
    this.logger.warn('audit.record.no_tx', {
      action: row.action,
      category: row.category,
    });
    const prevHash = await this.repo.latestRowHash(key.schoolId, key.category);
    return { prevHash, rowHash: this.chain.hashRow(prevHash, row) };
  }
}

function snakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}
