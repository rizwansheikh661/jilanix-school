import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { AuditLogCreateInput, AuditTxLike } from '../audit.types';

/**
 * Thin wrapper around `prisma.auditLog` so the audit service does not
 * depend directly on the Prisma client surface. Two callers:
 *
 *   - The AuditService, which usually has a transaction in hand and passes
 *     it via `tx`.
 *   - The verify CLI (later sprint), which reads the chain in batches.
 *
 * The `auditExt` extension already skips `audit_log` (it's in
 * `APPEND_ONLY_MODELS`), so writing through the extended client cannot
 * recurse. We still use a narrowed `AuditTxLike` shape so future audit
 * refactors don't have to touch every caller.
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async insert(
    data: AuditLogCreateInput,
    tx?: AuditTxLike,
  ): Promise<{ id: string; rowHash: string }> {
    const writer = tx ?? (this.prisma.client as unknown as AuditTxLike);
    return writer.auditLog.create({ data });
  }

  /**
   * Find the previous chain head for a `(schoolId, category)` partition.
   * Exposed for test seeding and the verify CLI. Production code routes
   * through FinanceChainService which holds the row lock inside a tx.
   */
  public async latestRowHash(
    schoolId: string | null,
    category: string,
    tx?: AuditTxLike,
  ): Promise<string | null> {
    const reader = tx ?? (this.prisma.client as unknown as AuditTxLike);
    const row = await reader.auditLog.findFirst({
      where: { schoolId, category },
      orderBy: { createdAt: 'desc' },
      select: { rowHash: true },
    });
    return row?.rowHash ?? null;
  }
}
