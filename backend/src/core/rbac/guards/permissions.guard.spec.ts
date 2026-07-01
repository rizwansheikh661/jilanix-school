import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthPrincipal } from '../../auth/auth.types';
import { IS_PUBLIC_METADATA_KEY } from '../../auth/token/token.constants';
import { RequestContextRegistry } from '../../request-context';
import { RBAC_METADATA } from '../rbac.constants';
import { MissingPermissionError, MissingRoleError } from '../rbac.errors';
import type { PermissionService } from '../services/permission.service';
import type { RoleService } from '../services/role.service';
import { PermissionsGuard } from './permissions.guard';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makePrincipal(roleIds: readonly string[] = []): AuthPrincipal {
  return {
    userId: 'user-1',
    schoolId: 'school-1',
    actorScope: 'tenant',
    roleIds,
    sessionId: 'sess',
    chainId: 'chain',
    tokenId: 'tok',
  };
}

function makeContext(metadata: Record<string, unknown>, user?: AuthPrincipal): ExecutionContext {
  const handler = function namedHandler() {};
  const cls = class NamedClass {};
  // Stamp metadata on both targets so the Reflector's getAllAndOverride
  // sees them. We use Reflect.defineMetadata directly to avoid setting up
  // SetMetadata's full pipeline.
  for (const [k, v] of Object.entries(metadata)) {
    Reflect.defineMetadata(k, v, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    switchToRpc: () => ({} as unknown as ReturnType<ExecutionContext['switchToRpc']>),
    switchToWs: () => ({} as unknown as ReturnType<ExecutionContext['switchToWs']>),
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard() {
  const reflector = new Reflector();
  const permissions: Mocked<PermissionService> = {
    check: jest.fn(),
    resolveForPrincipal: jest.fn().mockResolvedValue([]),
  } as unknown as Mocked<PermissionService>;
  const roles: Mocked<RoleService> = {
    resolveRoles: jest.fn(),
  } as unknown as Mocked<RoleService>;
  const guard = new PermissionsGuard(
    reflector,
    permissions as unknown as PermissionService,
    roles as unknown as RoleService,
  );
  return { guard, permissions, roles };
}

describe('PermissionsGuard', () => {
  it('passes through @Public() routes without consulting PermissionService', async () => {
    const { guard, permissions } = makeGuard();
    const ctx = makeContext({ [IS_PUBLIC_METADATA_KEY]: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(permissions.check).not.toHaveBeenCalled();
  });

  it('passes through routes without any RBAC declaration (auth-only)', async () => {
    const { guard, permissions } = makeGuard();
    const ctx = makeContext({}, makePrincipal());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(permissions.check).not.toHaveBeenCalled();
  });

  it('AND-mode: throws MissingPermissionError when check fails', async () => {
    const { guard, permissions } = makeGuard();
    permissions.check.mockResolvedValue({ allowed: false, missing: ['students.write'] });
    const ctx = makeContext(
      { [RBAC_METADATA.PERMISSIONS_ALL]: ['students.read', 'students.write'] },
      makePrincipal(['r']),
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(MissingPermissionError);
    expect(permissions.check).toHaveBeenCalledWith(
      expect.any(Object),
      ['students.read', 'students.write'],
      'all',
    );
  });

  it('AND-mode: passes when all permissions match', async () => {
    const { guard, permissions } = makeGuard();
    permissions.check.mockResolvedValue({ allowed: true, missing: [] });
    permissions.resolveForPrincipal.mockResolvedValue([]);
    const ctx = makeContext(
      { [RBAC_METADATA.PERMISSIONS_ALL]: ['students.read'] },
      makePrincipal(['r']),
    );
    await RequestContextRegistry.run(
      RequestContextRegistry.makeSystemContext({ schoolId: 'school-1', userId: 'user-1' }),
      async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
      },
    );
  });

  it('OR-mode: throws MissingPermissionError when none match', async () => {
    const { guard, permissions } = makeGuard();
    permissions.check.mockResolvedValue({
      allowed: false,
      missing: ['a.read', 'b.read'],
    });
    const ctx = makeContext(
      { [RBAC_METADATA.PERMISSIONS_ANY]: ['a.read', 'b.read'] },
      makePrincipal(['r']),
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(MissingPermissionError);
    expect(permissions.check).toHaveBeenCalledWith(expect.any(Object), ['a.read', 'b.read'], 'any');
  });

  it('@RequireRole: passes when principal has one of the required role keys', async () => {
    const { guard, roles, permissions } = makeGuard();
    roles.resolveRoles.mockResolvedValue([
      { id: 'r-1', key: 'school_admin', name: '', description: null, scope: 'tenant', isSystem: true },
    ]);
    permissions.resolveForPrincipal.mockResolvedValue([]);
    const ctx = makeContext(
      { [RBAC_METADATA.ROLES_ANY]: ['school_admin', 'principal'] },
      makePrincipal(['r-1']),
    );
    await RequestContextRegistry.run(
      RequestContextRegistry.makeSystemContext({}),
      async () => {
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
      },
    );
  });

  it('@RequireRole: throws MissingRoleError when no required role matches', async () => {
    const { guard, roles } = makeGuard();
    roles.resolveRoles.mockResolvedValue([
      { id: 'r-1', key: 'auditor', name: '', description: null, scope: 'tenant', isSystem: true },
    ]);
    const ctx = makeContext(
      { [RBAC_METADATA.ROLES_ANY]: ['school_admin'] },
      makePrincipal(['r-1']),
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(MissingRoleError);
  });

  it('throws MissingPermissionError when RBAC declared but no principal attached', async () => {
    const { guard } = makeGuard();
    const ctx = makeContext(
      { [RBAC_METADATA.PERMISSIONS_ALL]: ['students.read'] },
      undefined,
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(MissingPermissionError);
  });

  it('stamps resolved permissions onto RequestContext after a successful check', async () => {
    const { guard, permissions } = makeGuard();
    permissions.check.mockResolvedValue({ allowed: true, missing: [] });
    permissions.resolveForPrincipal.mockResolvedValue(['students.read']);
    const ctx = makeContext(
      { [RBAC_METADATA.PERMISSIONS_ALL]: ['students.read'] },
      makePrincipal(['r']),
    );
    await RequestContextRegistry.run(
      RequestContextRegistry.makeSystemContext({ schoolId: 'school-1', userId: 'user-1' }),
      async () => {
        await guard.canActivate(ctx);
        expect(RequestContextRegistry.peek()?.permissions).toEqual(['students.read']);
      },
    );
  });
});
