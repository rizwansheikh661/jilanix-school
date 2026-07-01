/**
 * Auth-specific domain error helpers.
 *
 * Per API_STANDARDS §20 the canonical HTTP-mapped code for auth failure is
 * `UNAUTHENTICATED` (401). Clients differentiate the user-facing flow
 * (re-prompt password vs clear all sessions vs trigger MFA) via
 * `details.reason`. Keep that string set stable — it's a client contract.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type AuthFailureReason =
  | 'invalid_credentials'
  | 'tenant_not_found'
  | 'user_disabled'
  | 'token_expired'
  | 'token_malformed'
  | 'refresh_invalid'
  | 'refresh_expired'
  | 'refresh_reused'
  | 'session_revoked'
  | 'mfa_required';

export class AuthError extends DomainError {
  public override readonly name: string = 'AuthError';
  constructor(message: string, reason: AuthFailureReason, extra?: Record<string, unknown>) {
    super({
      code: ERROR_CODES.UNAUTHENTICATED,
      message,
      details: { reason, ...(extra ?? {}) },
    });
  }
}

export class InvalidCredentialsError extends AuthError {
  public override readonly name = 'InvalidCredentialsError';
  constructor() {
    // Generic message — never reveal which of (email, password, tenant) was wrong.
    super('Invalid email or password', 'invalid_credentials');
  }
}

export class TenantNotFoundError extends AuthError {
  public override readonly name = 'TenantNotFoundError';
  constructor() {
    // Same wording as invalid credentials so probe attempts can't enumerate tenants.
    super('Invalid email or password', 'tenant_not_found');
  }
}

export class UserDisabledError extends AuthError {
  public override readonly name = 'UserDisabledError';
  constructor() {
    super('Account is disabled', 'user_disabled');
  }
}

export class TokenExpiredError extends AuthError {
  public override readonly name = 'TokenExpiredError';
  constructor() {
    super('Access token expired', 'token_expired');
  }
}

export class TokenMalformedError extends AuthError {
  public override readonly name = 'TokenMalformedError';
  constructor() {
    super('Access token is invalid', 'token_malformed');
  }
}

export class RefreshInvalidError extends AuthError {
  public override readonly name = 'RefreshInvalidError';
  constructor() {
    super('Refresh token is invalid', 'refresh_invalid');
  }
}

export class RefreshExpiredError extends AuthError {
  public override readonly name = 'RefreshExpiredError';
  constructor() {
    super('Refresh token has expired', 'refresh_expired');
  }
}

export class RefreshReusedError extends AuthError {
  public override readonly name = 'RefreshReusedError';
  constructor() {
    super(
      'Refresh token reuse detected — all sessions revoked. Please sign in again.',
      'refresh_reused',
    );
  }
}

export class SessionRevokedError extends AuthError {
  public override readonly name = 'SessionRevokedError';
  constructor() {
    super('Session has been revoked', 'session_revoked');
  }
}

export class MfaRequiredError extends AuthError {
  public override readonly name = 'MfaRequiredError';
  constructor() {
    super('Multi-factor authentication is required', 'mfa_required');
  }
}
