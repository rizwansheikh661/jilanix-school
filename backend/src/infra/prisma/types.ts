/**
 * Shapes consumed by the Prisma extension stack and by repositories. Kept
 * separate from `errors.ts` and `scope.ts` so callers can import only what
 * they need without pulling the whole infra surface.
 */

import type { Prisma } from '@prisma/client';

import type { RequestContext } from '../../core/request-context';

/**
 * Subset of the Prisma client transaction handle. We expose only this
 * subset to repositories so they cannot accidentally call methods that
 * would defeat the extension stack (e.g. `$queryRawUnsafe`).
 */
export type PrismaTx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

/**
 * Extension hook bag — used by extensions to communicate with each other
 * via Prisma's `query.args.__schoolosCtx` field. Stored on the args object
 * so each $extends layer can read what previous layers stamped without
 * reaching back into AsyncLocalStorage on every call.
 */
export interface QueryAnnotations {
  ctx?: RequestContext;
  bypassTenantScope?: { reason: string };
  bypassSoftDelete?: { reason: string };
  bypassAudit?: { reason: string };
}

declare module '@prisma/client' {
  // Augment the Prisma args bag so we can attach our annotations without
  // TypeScript complaining. The fields are namespaced under one key to
  // keep the surface small and easy to grep for.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface QueryEvent {
    schoolosCtx?: QueryAnnotations;
  }
}

/**
 * Pagination cursor shape returned by `paginateByCursor`. Always opaque to
 * callers — they treat `nextCursor` as a string.
 */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
