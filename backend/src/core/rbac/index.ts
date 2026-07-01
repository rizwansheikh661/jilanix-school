export {
  RequireAnyPermission,
  RequirePermissions,
  RequireRole,
} from './decorators/require-permissions.decorator';
export { PermissionsGuard } from './guards/permissions.guard';
export {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isValidPermissionKey,
  permissionMatches,
} from './permission-match';
export {
  BUILT_IN_ROLE_DEFINITIONS,
  Permissions,
  PERMISSION_WILDCARD_ALL,
  PERMISSION_WILDCARD_PREFIX,
  PERMISSION_WILDCARD_SUFFIX,
  RBAC_METADATA,
  RoleKeys,
} from './rbac.constants';
export type { BuiltInRoleDefinition, Permission, RoleKey } from './rbac.constants';
export {
  MissingPermissionError,
  MissingRoleError,
  RbacError,
  RoleAlreadyAssignedError,
  RoleAssignmentNotFoundError,
  RoleScopeMismatchError,
  UnknownRoleError,
} from './rbac.errors';
export type { RbacFailureReason } from './rbac.errors';
export { RbacModule } from './rbac.module';
export type {
  PermissionCheckMode,
  PermissionCheckResult,
  PermissionRow,
  RoleRow,
  UserRoleRow,
} from './rbac.types';
export { PermissionRepository } from './repositories/permission.repository';
export { RoleRepository } from './repositories/role.repository';
export { UserRoleRepository } from './repositories/user-role.repository';
export { PermissionService } from './services/permission.service';
export { RoleService } from './services/role.service';
