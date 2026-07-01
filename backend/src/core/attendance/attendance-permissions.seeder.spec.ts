/**
 * AttendancePermissionsSeeder unit spec — verifies all 21 permission keys
 * are upserted to the permission repository on application bootstrap, and
 * that the seeder is resilient to repository errors (logs but does not
 * crash the boot).
 */
import { AttendancePermissionsSeeder } from './attendance-permissions.seeder';
import { AttendancePermissions } from './attendance.constants';

describe('AttendancePermissionsSeeder', () => {
  it('upserts all 21 attendance permission keys', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new AttendancePermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    expect(repo.upsert).toHaveBeenCalledTimes(Object.keys(AttendancePermissions).length);
    const calls = repo.upsert.mock.calls as unknown as Array<[{ key: string; resource: string; action: string }]>;
    const seenKeys = calls.map((c) => c[0].key);
    expect(new Set(seenKeys)).toEqual(new Set(Object.values(AttendancePermissions)));
  });

  it('parses resource + action from each dotted key', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new AttendancePermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const calls = repo.upsert.mock.calls as unknown as Array<[{ key: string; resource: string; action: string }]>;
    const markCall = calls.find((c) => c[0].key === 'attendance.mark');
    expect(markCall?.[0]).toEqual(expect.objectContaining({ resource: 'attendance', action: 'mark' }));
  });

  it('does not throw if the repository fails — logs and continues', async () => {
    const repo = { upsert: jest.fn(async () => { throw new Error('db down'); }) };
    const seeder = new AttendancePermissionsSeeder(repo as never);
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
