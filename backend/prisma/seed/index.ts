/**
 * Seed orchestrator.
 *
 * Layered, idempotent — re-running is safe and is the documented way to
 * "fix drift" on a developer laptop. Each module exports `apply` and
 * `verify`; the runner calls both, in order, and aborts on first failure.
 *
 * Modes (selected by `SEED_TARGET`):
 *   - `prod-core`  : platform reference data only (regions, future plans).
 *                    Always safe to run against any environment.
 *   - `staging`    : prod-core + canary tenant.
 *   - `dev`        : staging set + dev fixtures (currently same as staging
 *                    because Sprint 1 has no fixture catalogue yet).
 *
 * Locks: an advisory lock prevents two seeders racing on a shared
 * environment (CI parallel jobs, two devs on the same staging DB). The
 * lock is released as soon as the runner finishes, success or fail.
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

import { applyCanaryTenant, verifyCanaryTenant } from './platform/canary-tenant';
import { applyDemoUsers, verifyDemoUsers } from './platform/demo-users';
import { applyRegions, verifyRegions } from './platform/regions';

type SeedTarget = 'prod-core' | 'staging' | 'dev';

interface SeedModule {
  readonly name: string;
  readonly apply: (prisma: PrismaClient) => Promise<void>;
  readonly verify: (prisma: PrismaClient) => Promise<void>;
}

const MODULES: Record<SeedTarget, readonly SeedModule[]> = {
  'prod-core': [{ name: 'platform/regions', apply: applyRegions, verify: verifyRegions }],
  staging: [
    { name: 'platform/regions', apply: applyRegions, verify: verifyRegions },
    { name: 'platform/canary-tenant', apply: applyCanaryTenant, verify: verifyCanaryTenant },
    { name: 'platform/demo-users', apply: applyDemoUsers, verify: verifyDemoUsers },
  ],
  dev: [
    { name: 'platform/regions', apply: applyRegions, verify: verifyRegions },
    { name: 'platform/canary-tenant', apply: applyCanaryTenant, verify: verifyCanaryTenant },
    { name: 'platform/demo-users', apply: applyDemoUsers, verify: verifyDemoUsers },
  ],
};

const ADVISORY_LOCK_KEY = 'schoolos_seed';
const ADVISORY_LOCK_TIMEOUT_SEC = 60;

async function withAdvisoryLock<T>(prisma: PrismaClient, fn: () => Promise<T>): Promise<T> {
  const acquired = await prisma.$queryRawUnsafe<Array<{ got: number | bigint }>>(
    `SELECT GET_LOCK('${ADVISORY_LOCK_KEY}', ${ADVISORY_LOCK_TIMEOUT_SEC}) AS got`,
  );
  // MySQL `GET_LOCK` returns BIGINT — Prisma 6's MySQL driver yields it as
  // `bigint`, which is strict-not-equal to the number literal `1`. Normalise
  // before comparing so the success path doesn't trip on a `1n` value.
  if (Number(acquired[0]?.got ?? 0) !== 1) {
    throw new Error(
      `Could not acquire seed lock '${ADVISORY_LOCK_KEY}' within ${ADVISORY_LOCK_TIMEOUT_SEC}s — another seeder is running.`,
    );
  }
  try {
    return await fn();
  } finally {
    await prisma.$queryRawUnsafe(`SELECT RELEASE_LOCK('${ADVISORY_LOCK_KEY}')`);
  }
}

function resolveTarget(): SeedTarget {
  const raw = (process.env.SEED_TARGET ?? 'dev').toLowerCase();
  if (raw === 'prod-core' || raw === 'staging' || raw === 'dev') {
    return raw;
  }
  throw new Error(`Invalid SEED_TARGET="${raw}" (expected prod-core | staging | dev).`);
}

async function main(): Promise<void> {
  const target = resolveTarget();
  const modules = MODULES[target];
  console.log(`[seed] target=${target} modules=${modules.length}`);

  const prisma = new PrismaClient({ datasourceUrl: process.env.DB_URL });
  await prisma.$connect();
  try {
    await withAdvisoryLock(prisma, async () => {
      for (const mod of modules) {
        const start = Date.now();
        console.log(`[seed]  → ${mod.name} (apply)`);
        await mod.apply(prisma);
        console.log(`[seed]  → ${mod.name} (verify)`);
        await mod.verify(prisma);
        console.log(`[seed]  ✓ ${mod.name} (${Date.now() - start}ms)`);
      }
    });
  } finally {
    await prisma.$disconnect();
  }
  console.log('[seed] done.');
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
