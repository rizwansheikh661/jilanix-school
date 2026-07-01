/**
 * Audit categories — see BACKEND_ARCHITECTURE §11.
 *
 * `finance` is the only category that REQUIRES a tamper-evident hash chain
 * (regulatory + dispute defence). `security` enforces append-only writes;
 * `general` is for ordinary business changes; `tenancy` for school
 * lifecycle (onboarding, archival, plan changes); `pii` for writes that
 * touch personally identifiable information (Aadhaar / PAN / RTE / category)
 * — separate channel so PII access can be reviewed independently of routine
 * business changes (DPDP Act 2023).
 */
export const AUDIT_CATEGORIES = [
  'general',
  'finance',
  'security',
  'tenancy',
  'pii',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Subset of actor scopes recorded against audit rows. */
export type AuditActorScope = 'tenant' | 'global' | 'system' | 'public';

/**
 * Per-event payload. The capture path (extension + decorator) builds this
 * and hands it to the service; the service is responsible for hashing,
 * persistence, and overflow handling.
 */
export interface AuditEvent {
  readonly action: string;
  readonly category: AuditCategory;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly schoolId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  /**
   * Names of fields whose values should be replaced with `[REDACTED]`
   * before the row is persisted. The base set is applied automatically
   * (see `BASE_SENSITIVE_FIELDS` in `audit.diff.ts`); supply this only
   * for model-specific additions (e.g. `["mfaSecret","recoveryCode"]`).
   */
  readonly sensitiveFields?: readonly string[];
}

/**
 * Intent captured by the Prisma `auditExt` and buffered per request until
 * the interceptor flushes it. Distinct from `AuditEvent` because the
 * extension does not yet have an `action` string — that comes from the
 * service decorator or from `auditExt`'s default mapping.
 */
export interface AuditIntent {
  readonly model: string;
  readonly operation: string;
  readonly category: AuditCategory;
  readonly schoolId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly capturedAt: number;
}

export interface AuditWriteOptions {
  /**
   * If provided, the audit row is written inside this transaction. Strongly
   * preferred — guarantees audit-and-write atomicity (BACKEND_ARCHITECTURE
   * §11.2). When omitted, the service opens its own short transaction.
   */
  readonly tx?: AuditTxLike;
}

/**
 * Narrow Prisma transaction interface, kept to a single method so the
 * audit module does not couple to the full PrismaClient surface.
 */
export interface AuditTxLike {
  readonly auditLog: {
    create: (args: { data: AuditLogCreateInput }) => Promise<{ id: string; rowHash: string }>;
    findFirst: (args: AuditLogFindArgs) => Promise<{ rowHash: string } | null>;
  };
}

export interface AuditLogCreateInput {
  id?: string;
  schoolId?: string | null;
  actorUserId?: string | null;
  actorScope: string;
  impersonatorUserId?: string | null;
  action: string;
  category: string;
  resourceType?: string | null;
  resourceId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  prevHash?: string | null;
  rowHash: string;
}

export interface AuditLogFindArgs {
  where: {
    schoolId?: string | null;
    category?: string;
  };
  orderBy: { createdAt: 'desc' };
  select: { rowHash: true };
}
