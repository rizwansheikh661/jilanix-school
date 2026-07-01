/**
 * Shared test harness for reporting service unit specs.
 */
import { RequestContextRegistry } from '../../request-context';

export const TEST_SCHOOL_ID = 'school-1';
export const TEST_USER_ID = 'user-1';
export const TEST_NOW = new Date('2026-06-23T00:00:00.000Z');

export function withTenantCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: TEST_SCHOOL_ID,
    userId: TEST_USER_ID,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

export function withTenantCtxAs<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: TEST_SCHOOL_ID,
    userId,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

export function makeFakePrisma(): {
  readonly prisma: {
    readonly transaction: jest.Mock;
    readonly client: Record<string, unknown>;
  };
  readonly fakeTx: Record<string, unknown>;
} {
  const fakeTx: Record<string, unknown> = {};
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

export function makeFakeSequences(start = 1): { readonly nextValue: jest.Mock } {
  let n = start;
  return { nextValue: jest.fn(async () => n++) };
}

export function makeFakeJobEnqueue(): { readonly enqueue: jest.Mock } {
  return {
    enqueue: jest.fn(async () => ({
      id: 'job-1',
      queue: 'reports',
      type: 'report.run',
    })),
  };
}
