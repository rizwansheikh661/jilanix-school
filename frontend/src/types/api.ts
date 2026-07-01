// ============================================================================
// API envelope & error types — mirror backend contract exactly.
//
// Success: backend/src/core/http/response-envelope.interceptor.ts
//   { data: T, meta: { requestId, ...extras } }
//
// Error: backend/src/core/http/global-exception.filter.ts +
//        backend/src/contracts/api.ts (ErrorPayload / ErrorEnvelope)
//   { error: { code, message, details?, requestId } }
//   Validation field-issues live at error.details.fields: FieldIssue[]
// ============================================================================

export interface ApiSuccess<T> {
  data: T;
  meta: {
    requestId: string;
    cursor?: {
      next?: string | null;
      previous?: string | null;
      hasMore?: boolean;
    };
    [key: string]: unknown;
  };
}

export interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId: string;
  details?: {
    fields?: FieldIssue[];
    [key: string]: unknown;
  };
}

export interface ApiErrorEnvelope {
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorEnvelope;

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
}

export type Versioned<T> = T & { version: number };

