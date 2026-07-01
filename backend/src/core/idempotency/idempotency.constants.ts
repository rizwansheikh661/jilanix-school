export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_TTL_HOURS = 24;
export const IDEMPOTENCY_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const);

export type IdempotencyStatus =
  (typeof IDEMPOTENCY_STATUS)[keyof typeof IDEMPOTENCY_STATUS];

/** HTTP methods that participate in idempotency replay. GET/DELETE/HEAD bypass. */
export const IDEMPOTENCY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);
