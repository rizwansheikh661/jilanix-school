/**
 * slowQueryExt — fifth and last extension in the stack.
 *
 * Times every Prisma operation. Anything above `thresholdMs` is logged as
 * a warning with model, operation, duration, and the request-correlation
 * fields stamped by `correlationExt`. Above 5× the threshold the entry
 * carries a Sentry breadcrumb (TODO: wire when SentryModule lands).
 *
 * The extension is the LAST in the stack so the timing measurement covers
 * everything the other extensions add, not just the Prisma engine call.
 */
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RequestContextRegistry } from '../../../core/request-context';

interface SlowQueryOptions {
  readonly thresholdMs: number;
  readonly logger?: Logger;
}

export function buildSlowQueryExt(options: SlowQueryOptions) {
  const logger = options.logger ?? new Logger('PrismaSlowQuery');
  const threshold = options.thresholdMs;

  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'schoolos.slowQuery',
      query: {
        $allModels: {
          async $allOperations({ args, query, model, operation }) {
            const start = process.hrtime.bigint();
            try {
              return await query(args);
            } finally {
              const elapsedNs = process.hrtime.bigint() - start;
              const elapsedMs = Number(elapsedNs / 1_000_000n);
              if (elapsedMs >= threshold) {
                const ctx = RequestContextRegistry.peek();
                const severity = elapsedMs >= threshold * 5 ? 'error' : 'warn';
                const line = `slow-query model=${model} op=${operation} duration_ms=${elapsedMs} threshold_ms=${threshold} request_id=${ctx?.requestId ?? '-'} school_id=${ctx?.schoolId ?? '-'}`;
                if (severity === 'error') {
                  logger.error(line);
                } else {
                  logger.warn(line);
                }
              }
            }
          },
        },
      },
    }),
  );
}
