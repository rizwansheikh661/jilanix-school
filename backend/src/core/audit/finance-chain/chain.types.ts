import type { AuditCategory } from '../audit.types';

/**
 * Per-partition hash chain. The audit log is partitioned monthly by
 * `(school_id, category)`; within each partition, every row's `row_hash`
 * is computed as `sha256(prev_hash || canonicalize(row))`.
 *
 * The chain is strongest for `finance`, where regulators and auditors
 * expect tamper evidence. Other categories use the same mechanism with a
 * looser anchor cadence (Sprint 1 records hashes but does not anchor).
 */
export interface ChainKey {
  readonly schoolId: string | null;
  readonly category: AuditCategory;
}

export interface ChainableRow {
  readonly schoolId: string | null;
  readonly category: AuditCategory;
  readonly action: string;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly actorUserId?: string | null;
  readonly actorScope: string;
  readonly beforeJson: unknown;
  readonly afterJson: unknown;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
  readonly createdAt: Date;
}

export interface ChainComputation {
  readonly prevHash: string | null;
  readonly rowHash: string;
}
