/**
 * RBAC-specific domain errors.
 *
 * The HTTP-mapped code for an authorization failure is
 * `INSUFFICIENT_PERMISSIONS` → 403. Distinguish from `UNAUTHENTICATED` →
 * 401 (no JWT / bad JWT), which is owned by `auth.errors.ts`.
 *
 * Why a separate `RbacError` class instead of using `ForbiddenError`
 * directly? It lets the guard attach structured `details` (the missing
 * permissions / required roles) without callers having to remember the
 * `details` shape.
 */
import { ERROR_CODES } from '../../contracts/api';
import { DomainError, ForbiddenError } from '../errors/domain-error';

export type RbacFailureReason =
  | 'missing_permission'
  | 'missing_role'
  | 'role_scope_mismatch'
  | 'unknown_role'
  | 'unknown_permission'
  | 'role_already_assigned'
  | 'role_assignment_not_found';

export class RbacError extends DomainError {
  public override readonly name: string = 'RbacError';
  constructor(message: string, reason: RbacFailureReason, extra?: Record<string, unknown>) {
    super({
      code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      message,
      details: { reason, ...(extra ?? {}) },
    });
  }
}

/**
 * Thrown by PermissionsGuard when the principal is missing one or more of
 * the permissions a route declared via `@RequirePermissions(...)`. Carries
 * `details.required` and `details.missing` so clients can render an
 * actionable error to support staff (`"You need: students.read"`).
 *
 * Inherits from ForbiddenError purely for the HTTP status mapping
 * convenience — production filters route on `code`, not class identity.
 */
export class MissingPermissionError extends ForbiddenError {
  public override readonly name: string = 'MissingPermissionError';
  constructor(args: {
    required: readonly string[];
    missing: readonly string[];
    mode: 'all' | 'any';
  }) {
    super('Insufficient permissions', {
      reason: 'missing_permission',
      mode: args.mode,
      required: [...args.required],
      missing: [...args.missing],
    });
  }
}

/**
 * Thrown by PermissionsGuard when a `@RequireRole(...)` check fails. We
 * consciously do NOT echo the user's actual role list back — that would
 * let attackers map out role hierarchies. We only echo `required`.
 */
export class MissingRoleError extends ForbiddenError {
  public override readonly name: string = 'MissingRoleError';
  constructor(required: readonly string[]) {
    super('Insufficient role', {
      reason: 'missing_role',
      required: [...required],
    });
  }
}

/** Trying to assign a `tenant` role to a `global` user (or vice versa). */
export class RoleScopeMismatchError extends RbacError {
  public override readonly name = 'RoleScopeMismatchError';
  constructor(args: { roleKey: string; roleScope: string; userScope: string }) {
    super(
      `Role "${args.roleKey}" cannot be assigned to a ${args.userScope}-scope user.`,
      'role_scope_mismatch',
      args,
    );
  }
}

export class UnknownRoleError extends RbacError {
  public override readonly name = 'UnknownRoleError';
  constructor(idOrKey: string) {
    super(`Role "${idOrKey}" not found`, 'unknown_role', { idOrKey });
  }
}

export class RoleAlreadyAssignedError extends RbacError {
  public override readonly name = 'RoleAlreadyAssignedError';
  constructor(args: { userId: string; roleId: string }) {
    super('Role is already assigned to this user', 'role_already_assigned', args);
  }
}

export class RoleAssignmentNotFoundError extends RbacError {
  public override readonly name = 'RoleAssignmentNotFoundError';
  constructor(args: { userId: string; roleId: string }) {
    super('Role assignment not found', 'role_assignment_not_found', args);
  }
}
