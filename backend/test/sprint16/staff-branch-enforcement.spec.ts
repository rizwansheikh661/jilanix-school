/**
 * Sprint 16 unit — Staff + Branch enforcement wiring.
 *
 * Asserts:
 *   1. StaffService.create calls guard.assertAndConsume('staff_count', 1) inside
 *      the create tx with `staff:<id>` source ref.
 *   2. BranchService.create calls guard.assertAndConsume('branch_count', 1)
 *      inside the create tx with `branch:<id>` source ref.
 */
import { RequestContextRegistry } from '../../src/core/request-context';
import { BranchService } from '../../src/core/branch/branch/branch.service';
import type { BranchRow } from '../../src/core/branch/branch.types';
import { StaffService } from '../../src/core/staff/staff/staff.service';
import type { StaffRow } from '../../src/core/staff/staff.types';

function inTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: 'school-1',
    userId: 'u-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

function makeStaffRow(over: Partial<StaffRow> = {}): StaffRow {
  return {
    id: 'staff-1',
    schoolId: 'school-1',
    firstName: 'Alan',
    lastName: 'Turing',
    dateOfBirth: null,
    gender: 'MALE',
    bloodGroup: null,
    photoUrl: null,
    email: null,
    phone: '+1 555 0100',
    alternatePhone: null,
    panEncrypted: null,
    panLast4: null,
    aadhaarEncrypted: null,
    aadhaarLast4: null,
    addressLine1: '1 Bletchley',
    addressLine2: null,
    city: 'Milton Keynes',
    state: 'BKM',
    postalCode: '00000',
    country: 'India',
    employeeCode: 'E-001',
    designation: 'Teacher',
    department: null,
    departmentId: null,
    designationId: null,
    dateOfJoining: new Date('2026-04-01'),
    dateOfLeaving: null,
    status: 'ACTIVE',
    bankAccountEncrypted: null,
    bankAccountLast4: null,
    bankIfsc: null,
    userId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...over,
  };
}

function makeBranchRow(over: Partial<BranchRow> = {}): BranchRow {
  return {
    id: 'br-1',
    schoolId: 'school-1',
    parentBranchId: null,
    code: 'MAIN',
    name: 'Main Campus',
    isPrimary: true,
    status: 'ACTIVE',
    addressLine1: null,
    addressLine2: null,
    city: null,
    stateCode: null,
    pincode: null,
    phone: null,
    email: null,
    establishedDate: null,
    managerStaffId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...over,
  };
}

describe('Sprint 16 — Staff + Branch enforcement', () => {
  it('StaffService.create calls assertAndConsume(staff_count, 1) inside the create tx', async () => {
    let txSeen: unknown = null;
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { __marker: 'tx' };
        txSeen = tx;
        return fn(tx);
      }),
    };
    const repo = {
      create: jest.fn().mockResolvedValue(makeStaffRow()),
      findById: jest.fn(),
      update: jest.fn(),
      setStatus: jest.fn(),
      softDelete: jest.fn(),
      findMany: jest.fn(),
    };
    const historyRepo = { append: jest.fn(async () => undefined) };
    const sequences = { nextValue: jest.fn(async () => 1n) };
    const crypto = {
      sealString: jest.fn((s: string) => `sealed:${s}`),
      openString: jest.fn((s: string) => s.replace(/^sealed:/, '')),
      last4: jest.fn((s: string) => s.slice(-4)),
    };
    const guard = {
      assertAndConsume: jest.fn(async () => ({})),
      releaseUsage: jest.fn(async () => undefined),
      assertMutationAllowed: jest.fn(async () => undefined),
    };

    const svc = new StaffService(
      prisma as never,
      repo as never,
      historyRepo as never,
      sequences as never,
      crypto as never,
      guard as never,
    );

    await inTenantCtx(() =>
      svc.create({
        firstName: 'Alan',
        lastName: 'Turing',
        gender: 'MALE',
        phone: '+1 555 0100',
        addressLine1: '1 Bletchley',
        city: 'Milton Keynes',
        state: 'BKM',
        postalCode: '00000',
        designation: 'Teacher',
        dateOfJoining: new Date('2026-04-01'),
      }),
    );

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(guard.assertAndConsume).toHaveBeenCalledTimes(1);
    const args = guard.assertAndConsume.mock.calls[0] as unknown[];
    expect(args[0]).toBe('school-1');
    expect(args[1]).toBe('staff_count');
    expect(args[2]).toBe(1);
    expect(args[3]).toBe('staff:staff-1');
    expect(args[4]).toBe(txSeen);
  });

  it('BranchService.create calls assertAndConsume(branch_count, 1) inside the create tx', async () => {
    let txSeen: unknown = null;
    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { __marker: 'tx' };
        txSeen = tx;
        return fn(tx);
      }),
    };
    const repo = {
      listAll: jest.fn(),
      findById: jest.fn(),
      findPrimary: jest.fn().mockResolvedValue(null),
      demoteAllPrimary: jest.fn(async () => undefined),
      create: jest.fn().mockResolvedValue(makeBranchRow()),
      update: jest.fn(),
      setPrimary: jest.fn(),
      setStatus: jest.fn(),
      softDelete: jest.fn(),
    };
    const guard = {
      assertAndConsume: jest.fn(async () => ({})),
      releaseUsage: jest.fn(async () => undefined),
      assertMutationAllowed: jest.fn(async () => undefined),
    };

    const svc = new BranchService(prisma as never, repo as never, guard as never);

    await inTenantCtx(() =>
      svc.create({ code: 'MAIN', name: 'Main Campus', isPrimary: true }),
    );

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(guard.assertAndConsume).toHaveBeenCalledTimes(1);
    const args = guard.assertAndConsume.mock.calls[0] as unknown[];
    expect(args[0]).toBe('school-1');
    expect(args[1]).toBe('branch_count');
    expect(args[2]).toBe(1);
    expect(args[3]).toBe('branch:br-1');
    expect(args[4]).toBe(txSeen);
  });
});
