import {
  InvalidCredentialsError,
  RefreshExpiredError,
  RefreshInvalidError,
  RefreshReusedError,
  UserDisabledError,
} from './auth.errors';
import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.types';
import type { PasswordService } from './password/password.service';
import type { LoginEventRepository } from './repositories/login-event.repository';
import type { SessionRepository, SessionRow } from './repositories/session.repository';
import type {
  UserLoginRow,
  UserRepository,
} from './repositories/user.repository';
import type { AccessTokenService } from './token/access-token.service';
import type { RefreshTokenService } from './token/refresh-token.service';
import type { UserRoleRepository } from '../rbac/repositories/user-role.repository';
import type { RoleRepository } from '../rbac/repositories/role.repository';
import type { PermissionService } from '../rbac/services/permission.service';
import type { FeatureFlagService } from '../feature-flag/services/feature-flag.service';
import type { ConfigService } from '../config';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeUserRow(overrides: Partial<UserLoginRow> = {}): UserLoginRow {
  return {
    id: 'user-1',
    schoolId: 'school-1',
    email: 'jane@example.com',
    displayName: 'Jane',
    actorScope: 'tenant',
    status: 'active',
    mfaEnabled: false,
    mustChangePassword: false,
    tokenSalt: '',
    passwordHash: '$argon2id$stub',
    passwordAlgorithm: 'argon2id',
    passwordParams: { memoryCost: 19_456, timeCost: 2, parallelism: 1 },
    passwordPepperVersion: 1,
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess-1',
    schoolId: 'school-1',
    userId: 'user-1',
    chainId: 'chain-1',
    parentSessionId: null,
    replacedBySessionId: null,
    issuedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    revokedReason: null,
    deviceId: null,
    ip: null,
    userAgent: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {
      school: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
  };
  const config = {
    auth: {
      refreshTtlDefaultSeconds: 86_400,
      refreshTtlRememberMeSeconds: 2_592_000,
      lockoutMaxAttempts: 5,
      lockoutDurationSeconds: 900,
    },
    jwt: { refreshTtlSeconds: 86_400 },
  };
  const users: Mocked<UserRepository> = {
    findForLogin: jest.fn(),
    findForLoginByIdentifier: jest.fn(),
    findActiveById: jest.fn(),
    markLogin: jest.fn().mockResolvedValue(undefined),
    upgradePasswordHash: jest.fn().mockResolvedValue(undefined),
    incrementFailedAttempts: jest.fn().mockResolvedValue(1),
    clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
    applyLockUntil: jest.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<UserRepository>;
  const sessions: Mocked<SessionRepository> = {
    createForLogin: jest.fn(),
    createForRotation: jest.fn(),
    findByTokenHash: jest.fn(),
    findChainRoot: jest.fn().mockResolvedValue(null),
    isActiveById: jest.fn(),
    markRotated: jest.fn().mockResolvedValue(undefined),
    revokeOne: jest.fn().mockResolvedValue(undefined),
    revokeChain: jest.fn().mockResolvedValue(0),
    revokeAllForUser: jest.fn().mockResolvedValue(0),
  } as unknown as Mocked<SessionRepository>;
  const loginEvents: Mocked<LoginEventRepository> = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<LoginEventRepository>;
  const passwords: Mocked<PasswordService> = {
    verify: jest.fn(),
    hash: jest.fn(),
    needsRehash: jest.fn(() => false),
  } as unknown as Mocked<PasswordService>;
  const accessTokens: Mocked<AccessTokenService> = {
    sign: jest.fn(async () => ({
      token: 'access.jwt.token',
      tokenId: 'tok-1',
      expiresAt: new Date(Date.now() + 900_000),
    })),
  } as unknown as Mocked<AccessTokenService>;
  const refreshTokens: Mocked<RefreshTokenService> = {
    generate: jest.fn(),
    hash: jest.fn(),
    isWellFormed: jest.fn(() => true),
  } as unknown as Mocked<RefreshTokenService>;
  const userRoles: Mocked<UserRoleRepository> = {
    listActiveRoleIdsForUser: jest.fn().mockResolvedValue([]),
  } as unknown as Mocked<UserRoleRepository>;
  const roles: Mocked<RoleRepository> = {
    findManyByIds: jest.fn().mockResolvedValue([]),
  } as unknown as Mocked<RoleRepository>;
  const permissions: Mocked<PermissionService> = {
    resolveForRoles: jest.fn().mockResolvedValue([]),
  } as unknown as Mocked<PermissionService>;
  const featureFlags: Mocked<FeatureFlagService> = {
    knownKeys: jest.fn(() => []),
    evaluate: jest.fn(),
  } as unknown as Mocked<FeatureFlagService>;

  const svc = new AuthService(
    prisma as never,
    config as unknown as ConfigService,
    users as never,
    sessions as never,
    loginEvents as never,
    passwords as never,
    accessTokens as never,
    refreshTokens as never,
    userRoles as never,
    roles as never,
    permissions as never,
    featureFlags as never,
  );
  return {
    svc,
    prisma,
    config,
    users,
    sessions,
    loginEvents,
    passwords,
    accessTokens,
    refreshTokens,
    userRoles,
    roles,
    permissions,
    featureFlags,
  };
}

describe('AuthService.login', () => {
  it('mints a token pair on valid credentials', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(makeUserRow());
    t.passwords.verify.mockResolvedValue(true);
    t.refreshTokens.generate.mockReturnValue({
      token: 'rft_xxx',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    t.sessions.createForLogin.mockResolvedValue(makeSession());

    const result = await t.svc.login({
      schoolId: 'school-1',
      email: 'jane@example.com',
      password: 'pw',
      context: { ip: '1.1.1.1' },
    });

    expect(result.accessToken).toBe('access.jwt.token');
    expect(result.refreshToken).toBe('rft_xxx');
    expect(result.tokenType).toBe('Bearer');
    expect(t.loginEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'login_success' }),
    );
  });

  it('throws InvalidCredentialsError on unknown user (records failure)', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(null);
    await expect(
      t.svc.login({ schoolId: 's', email: 'x', password: 'y', context: {} }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(t.loginEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'login_failure', reason: 'unknown_user' }),
    );
  });

  it('throws InvalidCredentialsError on bad password', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(makeUserRow());
    t.passwords.verify.mockResolvedValue(false);
    await expect(
      t.svc.login({ schoolId: 's', email: 'jane@example.com', password: 'pw', context: {} }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('throws UserDisabledError when status=disabled', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(makeUserRow({ status: 'disabled' }));
    t.passwords.verify.mockResolvedValue(true);
    await expect(
      t.svc.login({ schoolId: 's', email: 'jane@example.com', password: 'pw', context: {} }),
    ).rejects.toBeInstanceOf(UserDisabledError);
  });

  // ---- Sprint 14.1: mustChangePassword surface ---------------------------
  it('surfaces mustChangePassword=true when the user row carries the flag', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(makeUserRow({ mustChangePassword: true }));
    t.passwords.verify.mockResolvedValue(true);
    t.refreshTokens.generate.mockReturnValue({
      token: 'rft_xxx',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    t.sessions.createForLogin.mockResolvedValue(makeSession());

    const result = await t.svc.login({
      schoolId: 'school-1',
      email: 'jane@example.com',
      password: 'pw',
      context: {},
    });
    expect(result.mustChangePassword).toBe(true);
  });

  it('defaults mustChangePassword=false when the flag is absent (additive contract)', async () => {
    const t = makeService();
    t.users.findForLoginByIdentifier.mockResolvedValue(makeUserRow());
    t.passwords.verify.mockResolvedValue(true);
    t.refreshTokens.generate.mockReturnValue({
      token: 'rft_xxx',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    t.sessions.createForLogin.mockResolvedValue(makeSession());

    const result = await t.svc.login({
      schoolId: 'school-1',
      email: 'jane@example.com',
      password: 'pw',
      context: {},
    });
    expect(result.mustChangePassword).toBe(false);
    // Existing fields preserved — additive only.
    expect(result.accessToken).toBe('access.jwt.token');
    expect(result.refreshToken).toBe('rft_xxx');
    expect(result.tokenType).toBe('Bearer');
  });
});

describe('AuthService.refresh', () => {
  it('rotates the refresh token and revokes the parent session', async () => {
    const t = makeService();
    const oldSession = makeSession({ id: 'sess-old' });
    const newSession = makeSession({ id: 'sess-new', parentSessionId: 'sess-old' });
    t.refreshTokens.hash.mockReturnValue('hashed');
    t.refreshTokens.generate.mockReturnValue({
      token: 'rft_new',
      tokenHash: 'newhash',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    t.sessions.findByTokenHash.mockResolvedValue(oldSession);
    t.users.findActiveById.mockResolvedValue({
      id: 'user-1',
      schoolId: 'school-1',
      actorScope: 'tenant',
      status: 'active',
      tokenSalt: '',
    });
    t.sessions.createForRotation.mockResolvedValue(newSession);

    const result = await t.svc.refresh({
      refreshToken: 'rft_old',
      context: {},
    });

    expect(result.refreshToken).toBe('rft_new');
    expect(t.sessions.markRotated).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-old',
        replacedBySessionId: 'sess-new',
      }),
      expect.anything(),
    );
    expect(t.loginEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'refresh_rotated' }),
      expect.anything(),
    );
  });

  it('REVOKES THE WHOLE CHAIN when a revoked refresh is replayed', async () => {
    const t = makeService();
    const replayed = makeSession({
      id: 'sess-old',
      revokedAt: new Date(),
      revokedReason: 'rotated',
    });
    t.refreshTokens.hash.mockReturnValue('hashed');
    t.sessions.findByTokenHash.mockResolvedValue(replayed);
    t.sessions.revokeChain.mockResolvedValue(3);

    await expect(
      t.svc.refresh({ refreshToken: 'rft_x', context: {} }),
    ).rejects.toBeInstanceOf(RefreshReusedError);

    expect(t.sessions.revokeChain).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'chain-1', reason: 'reuse_detected' }),
      expect.anything(),
    );
    expect(t.loginEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'refresh_reused' }),
      expect.anything(),
    );
    // Crucially: a *new* session is NOT created on reuse.
    expect(t.sessions.createForRotation).not.toHaveBeenCalled();
  });

  it('throws RefreshExpiredError when expiresAt is in the past', async () => {
    const t = makeService();
    const expired = makeSession({ expiresAt: new Date(Date.now() - 60_000) });
    t.refreshTokens.hash.mockReturnValue('hashed');
    t.sessions.findByTokenHash.mockResolvedValue(expired);

    await expect(
      t.svc.refresh({ refreshToken: 'rft_x', context: {} }),
    ).rejects.toBeInstanceOf(RefreshExpiredError);
    expect(t.sessions.createForRotation).not.toHaveBeenCalled();
  });

  it('throws RefreshInvalidError on a malformed token', async () => {
    const t = makeService();
    t.refreshTokens.isWellFormed.mockReturnValue(false);
    await expect(
      t.svc.refresh({ refreshToken: 'nope', context: {} }),
    ).rejects.toBeInstanceOf(RefreshInvalidError);
    expect(t.sessions.findByTokenHash).not.toHaveBeenCalled();
  });

  it('throws RefreshInvalidError when no session matches the hash', async () => {
    const t = makeService();
    t.refreshTokens.hash.mockReturnValue('hashed');
    t.sessions.findByTokenHash.mockResolvedValue(null);
    await expect(
      t.svc.refresh({ refreshToken: 'rft_xxx', context: {} }),
    ).rejects.toBeInstanceOf(RefreshInvalidError);
  });
});

describe('AuthService.logout', () => {
  it('revokes the chain the principal belongs to', async () => {
    const t = makeService();
    const principal: AuthPrincipal = {
      userId: 'user-1',
      schoolId: 'school-1',
      actorScope: 'tenant',
      roleIds: [],
      sessionId: 'sess',
      chainId: 'chain-1',
      tokenId: 'tok',
    };
    await t.svc.logout(principal, {});
    expect(t.sessions.revokeChain).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 'chain-1', reason: 'logout' }),
    );
  });
});

describe('AuthService.logoutAll', () => {
  it('revokes every active session for the user', async () => {
    const t = makeService();
    t.sessions.revokeAllForUser.mockResolvedValue(4);
    const principal: AuthPrincipal = {
      userId: 'user-1',
      schoolId: 'school-1',
      actorScope: 'tenant',
      roleIds: [],
      sessionId: 'sess',
      chainId: 'chain-1',
      tokenId: 'tok',
    };
    const count = await t.svc.logoutAll(principal, {});
    expect(count).toBe(4);
    expect(t.sessions.revokeAllForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', reason: 'logout_all' }),
    );
  });
});
