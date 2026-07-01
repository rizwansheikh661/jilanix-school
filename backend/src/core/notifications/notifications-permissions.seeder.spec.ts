/**
 * NotificationsPermissionsSeeder unit spec — verifies every key in
 * `NotificationsPermissions` is upserted with a description and that
 * repeated bootstraps remain idempotent (each invocation calls `upsert`
 * once per key, mirroring the prod behaviour where the repo's underlying
 * Prisma upsert collapses duplicates).
 */
import {
  NOTIFICATIONS_PERMISSION_DESCRIPTIONS,
  NotificationsPermissions,
} from './notifications.constants';
import { NotificationsPermissionsSeeder } from './notifications-permissions.seeder';

describe('NotificationsPermissionsSeeder', () => {
  it('upserts every key in NotificationsPermissions exactly once per bootstrap', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new NotificationsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const expected = Object.values(NotificationsPermissions);
    expect(repo.upsert).toHaveBeenCalledTimes(expected.length);
    const seenKeys = (repo.upsert.mock.calls as unknown as Array<[{ key: string }]>).map(
      (c) => c[0].key,
    );
    expect(new Set(seenKeys)).toEqual(new Set(expected));
  });

  it('splits each dotted key into resource + action and pulls description from NOTIFICATIONS_PERMISSION_DESCRIPTIONS', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new NotificationsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const calls = repo.upsert.mock.calls as unknown as Array<
      [{ key: string; resource: string; action: string; description: string }]
    >;

    // Pick a few representative keys covering resource shapes.
    const templateCreate = calls.find((c) => c[0].key === 'notification-template.create');
    expect(templateCreate?.[0]).toEqual(
      expect.objectContaining({ resource: 'notification-template', action: 'create' }),
    );

    const entitlementAdminUpdate = calls.find(
      (c) => c[0].key === 'communication-entitlement.admin.update',
    );
    // The seeder joins everything after the first dot as the action.
    expect(entitlementAdminUpdate?.[0]).toEqual(
      expect.objectContaining({
        resource: 'communication-entitlement',
        action: 'admin.update',
      }),
    );

    // Every call must carry the canonical description.
    for (const call of calls) {
      const { key, description } = call[0];
      expect(description).toBeDefined();
      expect(description).toBe(
        NOTIFICATIONS_PERMISSION_DESCRIPTIONS[key as keyof typeof NOTIFICATIONS_PERMISSION_DESCRIPTIONS],
      );
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('is idempotent — second bootstrap produces the same set of calls as the first', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new NotificationsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const expectedCount = Object.values(NotificationsPermissions).length;
    expect(repo.upsert).toHaveBeenCalledTimes(expectedCount);

    repo.upsert.mockClear();
    await seeder.onApplicationBootstrap();
    expect(repo.upsert).toHaveBeenCalledTimes(expectedCount);
    const seenKeys = (repo.upsert.mock.calls as unknown as Array<[{ key: string }]>).map(
      (c) => c[0].key,
    );
    expect(new Set(seenKeys)).toEqual(new Set(Object.values(NotificationsPermissions)));
  });

  it('NOTIFICATIONS_PERMISSION_DESCRIPTIONS covers every NotificationsPermissions key', () => {
    for (const key of Object.values(NotificationsPermissions)) {
      const description =
        NOTIFICATIONS_PERMISSION_DESCRIPTIONS[
          key as keyof typeof NOTIFICATIONS_PERMISSION_DESCRIPTIONS
        ];
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('does not throw if the repository fails — logs and continues', async () => {
    const repo = {
      upsert: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const seeder = new NotificationsPermissionsSeeder(repo as never);
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
