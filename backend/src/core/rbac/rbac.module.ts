/**
 * RbacModule — wires roles, permissions, and the runtime guard into the
 * application.
 *
 * Provided publicly:
 *   - PermissionService    — the permission-check engine. Other modules
 *                            inject this for in-service checks (vs. the
 *                            decorator/guard which only fires at HTTP edges).
 *   - RoleService          — admin operations on roles + assignments.
 *   - PermissionsGuard     — registered as APP_GUARD in CoreModule so it
 *                            runs after JwtAuthGuard on every request.
 *   - RoleRepository,
 *     UserRoleRepository   — exported so AuthModule can populate the JWT
 *                            `role_ids` claim at login/refresh.
 *
 * Boot:
 *   - `BuiltInRolesSeeder` runs on `OnApplicationBootstrap`. The module
 *     declares it as a provider; Nest's module ready hooks fire after all
 *     dependencies (PrismaService, etc.) are initialised.
 *
 * @Global so feature modules don't have to import RbacModule explicitly
 * to use `@RequirePermissions(...)` — the metadata + guard work either way,
 * but injecting `PermissionService` from a feature module is more ergonomic
 * when the module is global.
 */
import { Global, Module } from '@nestjs/common';

import { BuiltInRolesSeeder } from './built-in-roles.seeder';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionRepository } from './repositories/permission.repository';
import { RoleRepository } from './repositories/role.repository';
import { UserRoleRepository } from './repositories/user-role.repository';
import { PermissionService } from './services/permission.service';
import { RoleService } from './services/role.service';

@Global()
@Module({
  providers: [
    PermissionRepository,
    RoleRepository,
    UserRoleRepository,
    PermissionService,
    RoleService,
    PermissionsGuard,
    BuiltInRolesSeeder,
  ],
  exports: [
    PermissionService,
    RoleService,
    PermissionsGuard,
    RoleRepository,
    UserRoleRepository,
    PermissionRepository,
  ],
})
export class RbacModule {}
