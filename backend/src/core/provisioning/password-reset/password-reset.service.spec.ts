/**
 * PasswordResetService unit spec — covers the issue/consume/first-login
 * flows plus the anti-enumeration constant-time path.
 *
 * The Prisma client + repositories are stubbed in-memory so the spec runs
 * without a database.
 */
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_TOKEN_TTL_MS,
  PasswordResetService,
} from './password-reset.service';
import {
  PasswordResetNotRequiredError,
  PasswordResetTokenInvalidError,
} from '../provisioning.errors';
import { ProvisioningOutboxTopics } from '../provisioning.constants';
import { UnauthenticatedError, ValidationFailedError } from '../../errors/domain-error';

interface FakeUser {
  id: string;
  schoolId: string;
  email: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  password: {
    passwordHash: string;
    algorithm: string;
    paramsJson: unknown;
    pepperVersion: number;
  } | null;
}

interface FakeResetRow {
  id: string;
  schoolId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  cancelledAt: Date | null;
}

function buildService(initialUsers: FakeUser[] = []) {
  const users = new Map<string, FakeUser>(initialUsers.map((u) => [u.id, u]));
  const tokens = new Map<string, FakeResetRow>();
  const userPasswordUpdates: Array<Record<string, unknown>> = [];
  const userUpdates: Array<Record<string, unknown>> = [];

  // Prisma client fake — used by `request()` and `firstLoginChange()` to
  // look up users via `findFirst`, and by the transaction body to update.
  const prismaClient = {
    user: {
      findFirst: jest.fn(async ({ where, select: _select }: { where: Record<string, unknown>; select?: unknown }) => {
        for (const u of users.values()) {
          if (u.schoolId !== where['schoolId']) continue;
          if (where['email'] !== undefined && u.email !== where['email']) continue;
          if (where['id'] !== undefined && u.id !== where['id']) continue;
          const statusFilter = where['status'] as { not?: string } | undefined;
          if (statusFilter?.not !== undefined && u.status === statusFilter.not) continue;
          return u;
        }
        return null;
      }),
      update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        userUpdates.push({ where: args.where, data: args.data });
        return {};
      }),
    },
    userPassword: {
      update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        userPasswordUpdates.push({ where: args.where, data: args.data });
        return {};
      }),
    },
  };

  const repo = {
    cancelOutstandingForUser: jest.fn(async () => 0),
    create: jest.fn(
      async (input: { schoolId: string; userId: string; tokenHash: string; expiresAt: Date }) => {
        const row: FakeResetRow = {
          id: `req-${tokens.size + 1}`,
          schoolId: input.schoolId,
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          consumedAt: null,
          cancelledAt: null,
        };
        tokens.set(row.tokenHash, row);
        return row;
      },
    ),
    findByTokenHash: jest.fn(async (hash: string) => tokens.get(hash) ?? null),
    markConsumed: jest.fn(async (_schoolId: string, id: string, at: Date) => {
      for (const row of tokens.values()) {
        if (row.id === id) row.consumedAt = at;
      }
    }),
  };

  const sessions = { revokeAllForUser: jest.fn(async () => ({ count: 2 })) };
  const passwords = {
    hash: jest.fn(async () => ({
      passwordHash: 'argon2id$hash',
      algorithm: 'argon2id',
      params: { memoryKiB: 65536 },
      pepperVersion: 1,
    })),
    verify: jest.fn(async (_stored: string, plain: string) => plain === 'CorrectOldPassword!9'),
  };
  const outbox = { publish: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };

  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaClient)),
    client: prismaClient,
  };

  const service = new PasswordResetService(
    prisma as never,
    repo as never,
    sessions as never,
    passwords as never,
    outbox as never,
    audit as never,
  );

  return {
    service,
    repo,
    sessions,
    passwords,
    outbox,
    audit,
    tokens,
    userPasswordUpdates,
    userUpdates,
  };
}

describe('PasswordResetService.request', () => {
  it('mints a token, persists the hash, emits PASSWORD_RESET_REQUESTED, returns cleartext', async () => {
    const { service, repo, outbox, tokens } = buildService([
      {
        id: 'u-1',
        schoolId: 's-1',
        email: 'admin@sunrise.local',
        status: 'active',
        mustChangePassword: false,
        password: null,
      },
    ]);

    const result = await service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });

    expect(result.accepted).toBe(true);
    expect(result.clearTextToken).toBeDefined();
    expect(result.clearTextToken!.length).toBeGreaterThan(20);
    expect(result.userId).toBe('u-1');
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(tokens.size).toBe(1);
    const row = [...tokens.values()][0]!;
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      PASSWORD_RESET_TOKEN_TTL_MS - 5_000,
    );
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        topic: ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED,
        payload: expect.objectContaining({
          userId: 'u-1',
          token: result.clearTextToken,
        }),
      }),
    );
  });

  it('returns accepted=true without leaking when the email is unknown (anti-enumeration)', async () => {
    const { service, repo, outbox } = buildService([]);
    const result = await service.request({ schoolId: 's-1', email: 'ghost@example.com' });
    expect(result).toEqual({ accepted: true });
    expect(repo.create).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it('cancels existing outstanding tokens before minting a new one', async () => {
    const { service, repo } = buildService([
      {
        id: 'u-1',
        schoolId: 's-1',
        email: 'admin@sunrise.local',
        status: 'active',
        mustChangePassword: false,
        password: null,
      },
    ]);
    await service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    expect(repo.cancelOutstandingForUser).toHaveBeenCalledWith(
      's-1',
      'u-1',
      expect.any(Date),
      expect.any(Object),
    );
  });

  it('throws ValidationFailedError when email is empty/whitespace', async () => {
    const { service } = buildService([]);
    await expect(
      service.request({ schoolId: 's-1', email: '   ' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe('PasswordResetService.confirm', () => {
  it('rotates the password, revokes sessions, marks token consumed', async () => {
    const { service, repo, sessions, userPasswordUpdates, userUpdates } = buildService([
      {
        id: 'u-1',
        schoolId: 's-1',
        email: 'admin@sunrise.local',
        status: 'active',
        mustChangePassword: true,
        password: null,
      },
    ]);
    const req = await service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    expect(req.clearTextToken).toBeDefined();

    await service.confirm({ token: req.clearTextToken!, newPassword: 'NewSecret-12345' });

    expect(repo.markConsumed).toHaveBeenCalled();
    expect(userPasswordUpdates).toHaveLength(1);
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0]!['data']).toMatchObject({
      mustChangePassword: false,
      passwordResetRequiredAt: null,
    });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', schoolId: 's-1', reason: 'password_changed' }),
      expect.any(Object),
    );
  });

  it('throws on unknown / mismatched token', async () => {
    const { service } = buildService([]);
    await expect(
      service.confirm({ token: 'bogus-token-value', newPassword: 'NewSecret-12345' }),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });

  it('throws when newPassword is shorter than the floor', async () => {
    const { service } = buildService([]);
    await expect(
      service.confirm({ token: 'x', newPassword: 'short' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });

  it('refuses an already-consumed token', async () => {
    const ctx = buildService([
      {
        id: 'u-1',
        schoolId: 's-1',
        email: 'admin@sunrise.local',
        status: 'active',
        mustChangePassword: true,
        password: null,
      },
    ]);
    const req = await ctx.service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    await ctx.service.confirm({
      token: req.clearTextToken!,
      newPassword: 'NewSecret-12345',
    });
    await expect(
      ctx.service.confirm({ token: req.clearTextToken!, newPassword: 'AnotherSecret-12' }),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });
});

describe('PasswordResetService.firstLoginChange', () => {
  const userRow: FakeUser = {
    id: 'u-1',
    schoolId: 's-1',
    email: 'admin@sunrise.local',
    status: 'active',
    mustChangePassword: true,
    password: {
      passwordHash: 'argon2id$old',
      algorithm: 'argon2id',
      paramsJson: {},
      pepperVersion: 1,
    },
  };

  it('rotates the password and clears mustChangePassword when current password is correct', async () => {
    const { service, sessions, userPasswordUpdates, userUpdates } = buildService([userRow]);

    await service.firstLoginChange({
      schoolId: 's-1',
      userId: 'u-1',
      currentPassword: 'CorrectOldPassword!9',
      newPassword: 'BrandNewSecret-12',
    });
    expect(userPasswordUpdates).toHaveLength(1);
    expect(userUpdates[0]!['data']).toMatchObject({ mustChangePassword: false });
    expect(sessions.revokeAllForUser).toHaveBeenCalled();
  });

  it('throws UnauthenticatedError when the current password is wrong', async () => {
    const { service } = buildService([userRow]);
    await expect(
      service.firstLoginChange({
        schoolId: 's-1',
        userId: 'u-1',
        currentPassword: 'WrongPassword!9',
        newPassword: 'BrandNewSecret-12',
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws PasswordResetNotRequiredError when mustChangePassword is already false', async () => {
    const { service } = buildService([{ ...userRow, mustChangePassword: false }]);
    await expect(
      service.firstLoginChange({
        schoolId: 's-1',
        userId: 'u-1',
        currentPassword: 'CorrectOldPassword!9',
        newPassword: 'BrandNewSecret-12',
      }),
    ).rejects.toBeInstanceOf(PasswordResetNotRequiredError);
  });
});
