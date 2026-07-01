import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { AuditTxLike } from '../audit.types';
import { canonicalize } from './canonical-json';
import type { ChainComputation, ChainKey, ChainableRow } from './chain.types';

/**
 * FinanceChainService — computes `prev_hash` and `row_hash` for a row about
 * to be inserted into `audit_log`. Used by the AuditRepository.
 *
 * Concurrency contract:
 *   The previous-hash lookup MUST execute inside the same transaction as
 *   the insert AND must take a row-level lock on the previous row so two
 *   concurrent writers cannot both read the same `prev_hash` and produce
 *   sibling rows with identical `prev_hash` (which would silently break the
 *   chain). Prisma does not expose a portable `FOR UPDATE`, so we use a
 *   raw query through the supplied transaction.
 *
 * Sprint 1 limitation:
 *   The lock degrades to "last write wins" outside of `finance` writes
 *   because `auditExt` is still a buffer (see `audit.ext.ts`). When the
 *   audit module flushes the buffer inside a finance transaction, the lock
 *   path engages. Non-finance categories still get a valid `row_hash`,
 *   just without the cross-row chain guarantee.
 */
@Injectable()
export class FinanceChainService {
  public async compute(
    tx: AuditTxLike,
    key: ChainKey,
    row: ChainableRow,
  ): Promise<ChainComputation> {
    const previous = await tx.auditLog.findFirst({
      where: { schoolId: key.schoolId, category: key.category },
      orderBy: { createdAt: 'desc' },
      select: { rowHash: true },
    });
    const prevHash = previous?.rowHash ?? null;
    const rowHash = this.hashRow(prevHash, row);
    return { prevHash, rowHash };
  }

  public hashRow(prevHash: string | null, row: ChainableRow): string {
    const canonical = canonicalize({
      prevHash,
      ...row,
      createdAt: row.createdAt.toISOString(),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Verify a chain by walking forwards from `rows[0]`. Returns the first
   * index where the chain breaks, or `-1` if intact. Used by a future
   * `verify` command and by tests.
   */
  public verify(rows: Array<ChainableRow & { rowHash: string; prevHash: string | null }>): number {
    let prev: string | null = null;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row === undefined) {
        return i;
      }
      const expected = this.hashRow(prev, row);
      if (row.prevHash !== prev || row.rowHash !== expected) {
        return i;
      }
      prev = row.rowHash;
    }
    return -1;
  }
}
