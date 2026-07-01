/**
 * FeesPermissionsSeeder unit spec — verifies all 42 Fees permission keys
 * (Sprint 9 baseline + 5 Sprint 9.1 hybrid-collection keys) are upserted with
 * the correct dotted resource/action split.
 */
import { FeesPermissionsSeeder } from './fees-permissions.seeder';
import { FeesPermissions } from './fees.constants';

describe('FeesPermissionsSeeder', () => {
  it('upserts all 42 fees permission keys', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new FeesPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    expect(repo.upsert).toHaveBeenCalledTimes(Object.keys(FeesPermissions).length);
    expect(Object.keys(FeesPermissions).length).toBe(42);
    const calls = repo.upsert.mock.calls as unknown as Array<
      [{ key: string; resource: string; action: string }]
    >;
    const seenKeys = calls.map((c) => c[0].key);
    expect(new Set(seenKeys)).toEqual(new Set(Object.values(FeesPermissions)));
    // Sprint 9.1 keys must be present.
    expect(seenKeys).toEqual(
      expect.arrayContaining([
        'fee-payment-source.read',
        'fee-payment-source.create',
        'fee-payment-source.update',
        'fee-payment-source.delete',
        'fee-payment.verify',
      ]),
    );
  });

  it('splits each dotted key into resource + action correctly', async () => {
    const repo = { upsert: jest.fn(async () => undefined) };
    const seeder = new FeesPermissionsSeeder(repo as never);
    await seeder.onApplicationBootstrap();
    const calls = repo.upsert.mock.calls as unknown as Array<
      [{ key: string; resource: string; action: string }]
    >;
    const headCreate = calls.find((c) => c[0].key === 'fee-head.create');
    expect(headCreate?.[0]).toEqual(
      expect.objectContaining({ resource: 'fee-head', action: 'create' }),
    );
    const studentApprove = calls.find((c) => c[0].key === 'student-fee-discount.approve');
    expect(studentApprove?.[0]).toEqual(
      expect.objectContaining({ resource: 'student-fee-discount', action: 'approve' }),
    );
    const invoiceApplyFines = calls.find((c) => c[0].key === 'fee-invoice.apply-fines');
    expect(invoiceApplyFines?.[0]).toEqual(
      expect.objectContaining({ resource: 'fee-invoice', action: 'apply-fines' }),
    );
  });

  it('does not throw if the repository fails — logs and continues', async () => {
    const repo = {
      upsert: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const seeder = new FeesPermissionsSeeder(repo as never);
    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
