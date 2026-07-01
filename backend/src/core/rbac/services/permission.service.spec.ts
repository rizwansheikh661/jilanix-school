import type { AuthPrincipal } from '../../auth/auth.types';
import type { RoleRepository } from '../repositories/role.repository';
import { PermissionService } from './permission.service';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makePrincipal(roleIds: readonly string[]): AuthPrincipal {
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

function makeService() {
  const roles: Mocked<RoleRepository> = {
    permissionsForRole: jest.fn(),
    permissionsForRoles: jest.fn(),
  } as unknown as Mocked<RoleRepository>;
  const svc = new PermissionService(roles as unknown as RoleRepository);
  return { svc, roles };
}

describe('PermissionService.resolveForRoles', () => {
  it('returns [] when the principal has no roles', async () => {
    const { svc, roles } = makeService();
    const result = await svc.resolveForRoles([]);
    expect(result).toEqual([]);
    expect(roles.permissionsForRoles).not.toHaveBeenCalled();
  });

  it('merges permission sets across roles, deduplicating', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(
      new Map([
        ['role-a', ['students.read', 'students.write']],
        ['role-b', ['students.read', 'attendance.mark']],
      ]),
    );
    const result = await svc.resolveForRoles(['role-a', 'role-b']);
    expect(new Set(result)).toEqual(
      new Set(['students.read', 'students.write', 'attendance.mark']),
    );
  });

  it('caches per-role permissions across calls (one DB call for repeated role ids)', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(
      new Map([['role-a', ['students.read']]]),
    );
    await svc.resolveForRoles(['role-a']);
    await svc.resolveForRoles(['role-a']);
    expect(roles.permissionsForRoles).toHaveBeenCalledTimes(1);
  });

  it('only fetches uncached roleIds on the second call', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles
      .mockResolvedValueOnce(new Map([['role-a', ['x.read']]]))
      .mockResolvedValueOnce(new Map([['role-b', ['y.read']]]));
    await svc.resolveForRoles(['role-a']);
    await svc.resolveForRoles(['role-a', 'role-b']);
    expect(roles.permissionsForRoles).toHaveBeenNthCalledWith(2, ['role-b']);
  });

  it('invalidateRole forces a refetch on next call', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles
      .mockResolvedValueOnce(new Map([['role-a', ['x.read']]]))
      .mockResolvedValueOnce(new Map([['role-a', ['x.read', 'x.write']]]));
    await svc.resolveForRoles(['role-a']);
    svc.invalidateRole('role-a');
    const second = await svc.resolveForRoles(['role-a']);
    expect(second).toEqual(expect.arrayContaining(['x.write']));
  });
});

describe('PermissionService.check', () => {
  it('allows when required is empty', async () => {
    const { svc } = makeService();
    const r = await svc.check(makePrincipal([]), [], 'all');
    expect(r.allowed).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('AND-mode passes when every permission is granted', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(
      new Map([['r', ['students.read', 'students.write']]]),
    );
    const r = await svc.check(makePrincipal(['r']), ['students.read', 'students.write'], 'all');
    expect(r.allowed).toBe(true);
  });

  it('AND-mode missing returns the unmatched subset', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(new Map([['r', ['students.read']]]));
    const r = await svc.check(makePrincipal(['r']), ['students.read', 'students.write'], 'all');
    expect(r.allowed).toBe(false);
    expect(r.missing).toEqual(['students.write']);
  });

  it('OR-mode passes when at least one is granted', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(new Map([['r', ['students.read']]]));
    const r = await svc.check(makePrincipal(['r']), ['students.read', 'students.write'], 'any');
    expect(r.allowed).toBe(true);
  });

  it('OR-mode missing returns the full required set when none match', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(new Map([['r', ['attendance.mark']]]));
    const r = await svc.check(makePrincipal(['r']), ['students.read', 'students.write'], 'any');
    expect(r.allowed).toBe(false);
    expect(r.missing).toEqual(['students.read', 'students.write']);
  });

  it('a `*` grant passes any AND check', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(new Map([['superadmin', ['*']]]));
    const r = await svc.check(makePrincipal(['superadmin']), ['anything.you.want'], 'all');
    expect(r.allowed).toBe(true);
  });

  it('resource wildcard satisfies any action under that resource', async () => {
    const { svc, roles } = makeService();
    roles.permissionsForRoles.mockResolvedValue(new Map([['r', ['students.*']]]));
    const r = await svc.check(makePrincipal(['r']), ['students.read', 'students.bulk_import'], 'all');
    expect(r.allowed).toBe(true);
  });
});
