/**
 * Sprint 14 e2e — Password reset + first-login change flow.
 *
 * Exercises the REAL PasswordResetService against an in-memory user store
 * and a token-hash-keyed fake repository, end-to-end:
 *   - request() issues a token, persists only the sha256 hash
 *   - the cleartext token reaches the outbox payload exactly once
 *   - confirm() rotates the password, revokes sessions, marks the token consumed
 *   - re-using a consumed token is rejected
 *   - request() for an unknown email returns accepted=true WITHOUT writing anything
 *   - firstLoginChange() clears mustChangePassword + revokes sessions
 */
import { createHash } from 'node:crypto';

import {
  PasswordResetService,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../../src/core/provisioning/password-reset/password-reset.service';
import {
  PasswordResetNotRequiredError,
  PasswordResetTokenInvalidError,
} from '../../src/core/provisioning/provisioning.errors';
import { ProvisioningOutboxTopics } from '../../src/core/provisioning/provisioning.constants';
import { UnauthenticatedError } from '../../src/core/errors/domain-error';

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

interface FakeTokenRow {
  id: string;
  schoolId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  cancelledAt: Date | null;
}

function buildSuite(seed: FakeUser[] = []) {
  const users = new Map<string, FakeUser>(seed.map((u) => [u.id, u]));
  const tokens: FakeTokenRow[] = [];
  const passwordWrites: Array<Record<string, unknown>> = [];
  const userWrites: Array<Record<string, unknown>> = [];
  const outboxEvents: Array<{ topic: string; payload: Record<string, unknown> }> = [];

  const txClient = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
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
        userWrites.push({ where: args.where, data: args.data });
      }),
    },
    userPassword: {
      update: jest.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        passwordWrites.push({ where: args.where, data: args.data });
      }),
    },
  };

  const repo = {
    cancelOutstandingForUser: jest.fn(async (schoolId: string, userId: string, at: Date) => {
      let count = 0;
      for (const t of tokens) {
        if (
          t.schoolId === schoolId &&
          t.userId === userId &&
          t.consumedAt === null &&
          t.cancelledAt === null
        ) {
          t.cancelledAt = at;
          count += 1;
        }
      }
      return count;
    }),
    create: jest.fn(
      async (input: { schoolId: string; userId: string; tokenHash: string; expiresAt: Date }) => {
        const row: FakeTokenRow = {
          id: `req-${(tokens.length + 1).toString()}`,
          schoolId: input.schoolId,
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          consumedAt: null,
          cancelledAt: null,
        };
        tokens.push(row);
        return row;
      },
    ),
    findByTokenHash: jest.fn(async (hash: string) => tokens.find((t) => t.tokenHash === hash) ?? null),
    markConsumed: jest.fn(async (_schoolId: string, id: string, at: Date) => {
      const t = tokens.find((r) => r.id === id);
      if (t) t.consumedAt = at;
    }),
  };

  const sessions = { revokeAllForUser: jest.fn(async () => ({ count: 3 })) };
  const passwords = {
    hash: jest.fn(async (plain: string) => ({
      passwordHash: `argon2id$${plain.slice(0, 4)}$hash`,
      algorithm: 'argon2id',
      params: { memoryKiB: 65536, timeCost: 3, parallelism: 1 },
      pepperVersion: 1,
    })),
    verify: jest.fn(async (_stored: string, plain: string) => plain === 'CorrectOldPassword!9'),
  };
  const outbox = {
    publish: jest.fn(
      async (
        _tx: unknown,
        event: { topic: string; payload: Record<string, unknown> },
      ) => {
        outboxEvents.push({ topic: event.topic, payload: event.payload });
      },
    ),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient)),
    client: txClient,
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
    sessions,
    passwords,
    outboxEvents,
    tokens,
    passwordWrites,
    userWrites,
    repo,
  };
}

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

describe('Sprint 14 e2e — Password reset flow', () => {
  const userRow = {
    id: 'u-1',
    schoolId: 's-1',
    email: 'admin@sunrise.local',
    status: 'active' as const,
    mustChangePassword: true,
    password: {
      passwordHash: 'argon2id$old$hash',
      algorithm: 'argon2id',
      paramsJson: {},
      pepperVersion: 1,
    },
  };

  it('request → confirm: rotates password, revokes sessions, leaks no cleartext to DB', async () => {
    const ctx = buildSuite([userRow]);

    const issued = await ctx.service.request({
      schoolId: 's-1',
      email: 'admin@sunrise.local',
      ip: '203.0.113.7',
      userAgent: 'jest',
    });

    expect(issued.accepted).toBe(true);
    expect(issued.clearTextToken).toBeDefined();
    expect(issued.userId).toBe('u-1');
    expect(ctx.tokens).toHaveLength(1);

    // Cleartext token never lands in the persisted row — only the sha256.
    const stored = ctx.tokens[0]!;
    expect(stored.tokenHash).toBe(sha256Hex(issued.clearTextToken!));
    expect(stored.tokenHash).not.toBe(issued.clearTextToken);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + PASSWORD_RESET_TOKEN_TTL_MS - 5_000,
    );

    // Outbox carries the cleartext for the email worker.
    expect(ctx.outboxEvents).toHaveLength(1);
    expect(ctx.outboxEvents[0]).toMatchObject({
      topic: ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED,
      payload: { userId: 'u-1', token: issued.clearTextToken },
    });

    // Confirm — rotates password + revokes sessions + clears mustChangePassword.
    await ctx.service.confirm({
      token: issued.clearTextToken!,
      newPassword: 'BrandNewSecret-12',
    });

    expect(ctx.passwords.hash).toHaveBeenCalledWith('BrandNewSecret-12');
    expect(ctx.passwordWrites).toHaveLength(1);
    expect(ctx.userWrites).toHaveLength(1);
    expect(ctx.userWrites[0]!['data']).toMatchObject({
      mustChangePassword: false,
      passwordResetRequiredAt: null,
    });
    expect(ctx.sessions.revokeAllForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', reason: 'password_changed' }),
      expect.any(Object),
    );
    expect(ctx.tokens[0]!.consumedAt).not.toBeNull();
  });

  it('rejects re-using a consumed token', async () => {
    const ctx = buildSuite([userRow]);
    const issued = await ctx.service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    await ctx.service.confirm({
      token: issued.clearTextToken!,
      newPassword: 'BrandNewSecret-12',
    });
    await expect(
      ctx.service.confirm({
        token: issued.clearTextToken!,
        newPassword: 'AnotherSecret-12',
      }),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });

  it('request() on an unknown email returns accepted=true with no writes (anti-enumeration)', async () => {
    const ctx = buildSuite([userRow]);
    const result = await ctx.service.request({
      schoolId: 's-1',
      email: 'someone-else@example.com',
    });
    expect(result).toEqual({ accepted: true });
    expect(ctx.tokens).toHaveLength(0);
    expect(ctx.outboxEvents).toHaveLength(0);
    expect(ctx.repo.create).not.toHaveBeenCalled();
  });

  it('issuing a new token cancels the prior outstanding one', async () => {
    const ctx = buildSuite([userRow]);
    await ctx.service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    await ctx.service.request({ schoolId: 's-1', email: 'admin@sunrise.local' });
    expect(ctx.tokens).toHaveLength(2);
    expect(ctx.tokens[0]!.cancelledAt).not.toBeNull();
    expect(ctx.tokens[1]!.cancelledAt).toBeNull();
  });

  it('firstLoginChange: succeeds with the correct current password', async () => {
    const ctx = buildSuite([userRow]);
    await ctx.service.firstLoginChange({
      schoolId: 's-1',
      userId: 'u-1',
      currentPassword: 'CorrectOldPassword!9',
      newPassword: 'NewSecret-Pass-12',
    });
    expect(ctx.passwordWrites).toHaveLength(1);
    expect(ctx.userWrites[0]!['data']).toMatchObject({ mustChangePassword: false });
    expect(ctx.sessions.revokeAllForUser).toHaveBeenCalled();
  });

  it('firstLoginChange: throws UnauthenticatedError on wrong current password', async () => {
    const ctx = buildSuite([userRow]);
    await expect(
      ctx.service.firstLoginChange({
        schoolId: 's-1',
        userId: 'u-1',
        currentPassword: 'WrongPassword!9',
        newPassword: 'NewSecret-Pass-12',
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('firstLoginChange: throws PasswordResetNotRequiredError when mustChangePassword is false', async () => {
    const ctx = buildSuite([{ ...userRow, mustChangePassword: false }]);
    await expect(
      ctx.service.firstLoginChange({
        schoolId: 's-1',
        userId: 'u-1',
        currentPassword: 'CorrectOldPassword!9',
        newPassword: 'NewSecret-Pass-12',
      }),
    ).rejects.toBeInstanceOf(PasswordResetNotRequiredError);
  });
});
