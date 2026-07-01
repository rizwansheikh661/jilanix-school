import type { ApiErrorEnvelope, FieldIssue } from '@/types/api';

/**
 * Wraps the backend error envelope:
 *   { error: { code, message, details?: { fields?: FieldIssue[] }, requestId } }
 * Source: backend/src/core/http/global-exception.filter.ts
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId: string | undefined;
  public readonly fields: readonly FieldIssue[] | undefined;
  public readonly details: Record<string, unknown> | undefined;
  public readonly raw: ApiErrorEnvelope | undefined;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    fields?: readonly FieldIssue[];
    details?: Record<string, unknown>;
    raw?: ApiErrorEnvelope;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status;
    this.requestId = args.requestId;
    this.fields = args.fields;
    this.details = args.details;
    this.raw = args.raw;
  }

  isUnauthorized(): boolean {
    return this.status === 401 || this.code === 'UNAUTHENTICATED';
  }

  isForbidden(): boolean {
    return this.status === 403 || this.code === 'INSUFFICIENT_PERMISSIONS';
  }

  isConflict(): boolean {
    return this.status === 409 || this.status === 412 || this.code === 'VERSION_CONFLICT';
  }

  isVersionMismatch(): boolean {
    return this.status === 412 || this.code === 'VERSION_CONFLICT';
  }

  isValidation(): boolean {
    return this.status === 422 || this.code === 'VALIDATION_FAILED';
  }

  isRateLimited(): boolean {
    return this.status === 429 || this.code === 'RATE_LIMITED';
  }

  /** Field issues grouped by `path` for display under form inputs. */
  fieldsByPath(): Record<string, FieldIssue[]> {
    const out: Record<string, FieldIssue[]> = {};
    for (const issue of this.fields ?? []) {
      (out[issue.path] ??= []).push(issue);
    }
    return out;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Normalize a thrown value into a user-presentable string. Prefer
 * ApiError.message + ApiError.requestId for support-friendly UI.
 */
export function describeError(err: unknown): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Something went wrong. Please try again.';
}
