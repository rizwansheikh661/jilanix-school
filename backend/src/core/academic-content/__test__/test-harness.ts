/**
 * Shared test harness for academic-content service unit specs.
 *
 * Builds a fake tx whose `findMany` always returns the requested ids so
 * `assertTenantRefs` short-circuits to "all-found". Provides `withCtx` to
 * run inside a synthetic tenant-scoped RequestContext.
 */
import { RequestContextRegistry } from '../../request-context';

export const TEST_SCHOOL_ID = 'school-1';
export const TEST_USER_ID = 'user-1';
export const TEST_NOW = new Date('2026-06-22T00:00:00.000Z');

export function withTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: TEST_SCHOOL_ID,
    userId: TEST_USER_ID,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

/**
 * Build a fake tx that satisfies `assertTenantRefs` and supports a generic
 * Prisma client surface for repository pass-throughs that aren't otherwise
 * mocked away by stubbing repo methods.
 */
export function makeFakeTx(): Record<string, unknown> {
  const echoFindMany = (args: { where: { id: { in: string[] } } }) =>
    Promise.resolve(args.where.id.in.map((id) => ({ id })));
  return {
    academicYear: { findMany: jest.fn(echoFindMany) },
    class: { findMany: jest.fn(echoFindMany) },
    section: { findMany: jest.fn(echoFindMany) },
    subject: { findMany: jest.fn(echoFindMany) },
    student: {
      findMany: jest.fn((args: { where: { id?: { in: string[] } } }) => {
        if (args.where.id?.in) {
          return Promise.resolve(args.where.id.in.map((id) => ({ id })));
        }
        return Promise.resolve([]);
      }),
    },
    staff: { findMany: jest.fn(echoFindMany) },
    fileAsset: { findMany: jest.fn(echoFindMany) },
  };
}

/**
 * A minimal PrismaService stand-in whose `transaction` invokes the callback
 * with a fake tx that satisfies the cross-tenant FK guard.
 */
export function makeFakePrisma(): {
  readonly prisma: {
    readonly transaction: jest.Mock;
    readonly client: Record<string, unknown>;
  };
  readonly fakeTx: Record<string, unknown>;
} {
  const fakeTx = makeFakeTx();
  return {
    prisma: {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(fakeTx),
      ),
      client: fakeTx,
    },
    fakeTx,
  };
}

export function makeFakeFeatureFlags(enabled = true): {
  readonly isEnabled: jest.Mock;
} {
  return { isEnabled: jest.fn(async () => enabled) };
}

export function makeFakeOutbox(): { readonly publish: jest.Mock } {
  return { publish: jest.fn(async () => undefined) };
}

export function makeFakeAudit(): { readonly record: jest.Mock } {
  return { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
}

export function makeFakeDispatcher(): { readonly dispatch: jest.Mock } {
  return { dispatch: jest.fn(async () => undefined) };
}

export function makeFakeSequences(start = 1): { readonly nextValue: jest.Mock } {
  let n = start;
  return { nextValue: jest.fn(async () => n++) };
}
