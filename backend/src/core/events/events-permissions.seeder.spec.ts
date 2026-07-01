/**
 * EventsPermissionsSeeder unit spec — verifies all 29 Events permission
 * keys are upserted with a description, repeated bootstraps remain
 * idempotent, and seed failures are swallowed and logged.
 */
import {
  EVENTS_PERMISSION_DESCRIPTIONS,
  EventsPermissions,
} from './events.constants';
import { EventsPermissionsSeeder } from './events-permissions.seeder';

describe('EventsPermissionsSeeder', () => {
  it('upserts every key in EventsPermissions exactly once per bootstrap', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new EventsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const expected = Object.values(EventsPermissions);
    expect(expected.length).toBeGreaterThanOrEqual(29);
    expect(repo.upsert).toHaveBeenCalledTimes(expected.length);
    const seenKeys = (repo.upsert.mock.calls as unknown as Array<[{ key: string }]>).map(
      (c) => c[0].key,
    );
    expect(new Set(seenKeys)).toEqual(new Set(expected));
  });

  it('splits each dotted key into resource + action and supplies description', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new EventsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const calls = repo.upsert.mock.calls as unknown as Array<
      [{ key: string; resource: string; action: string; description: string }]
    >;

    const eventCreate = calls.find((c) => c[0].key === 'event.create');
    expect(eventCreate?.[0]).toEqual(
      expect.objectContaining({ resource: 'event', action: 'create' }),
    );

    const openReg = calls.find((c) => c[0].key === 'event.open-registration');
    expect(openReg?.[0]).toEqual(
      expect.objectContaining({ resource: 'event', action: 'open-registration' }),
    );

    const feeAssignment = calls.find(
      (c) => c[0].key === 'event-fee-assignment.generate-invoices',
    );
    expect(feeAssignment?.[0]).toEqual(
      expect.objectContaining({
        resource: 'event-fee-assignment',
        action: 'generate-invoices',
      }),
    );

    for (const call of calls) {
      const { key, description } = call[0];
      expect(description).toBe(
        EVENTS_PERMISSION_DESCRIPTIONS[key as keyof typeof EVENTS_PERMISSION_DESCRIPTIONS],
      );
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it('is idempotent — second bootstrap produces the same set of calls', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new EventsPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const expectedCount = Object.values(EventsPermissions).length;
    expect(repo.upsert).toHaveBeenCalledTimes(expectedCount);

    repo.upsert.mockClear();
    await seeder.onApplicationBootstrap();
    expect(repo.upsert).toHaveBeenCalledTimes(expectedCount);
  });

  it('EVENTS_PERMISSION_DESCRIPTIONS covers every EventsPermissions key', () => {
    for (const key of Object.values(EventsPermissions)) {
      const description =
        EVENTS_PERMISSION_DESCRIPTIONS[
          key as keyof typeof EVENTS_PERMISSION_DESCRIPTIONS
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
    const seeder = new EventsPermissionsSeeder(repo as never);
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
