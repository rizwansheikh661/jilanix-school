import type { IdempotencyStatus } from './idempotency.constants';

export interface IdempotencyKeyRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly key: string;
  readonly requestFingerprint: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
  readonly status: IdempotencyStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}
