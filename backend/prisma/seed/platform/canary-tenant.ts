/**
 * Canary tenant seed.
 *
 * Creates one demo school plus its `school_settings` row with sane defaults.
 * This is the smallest possible data set that proves end-to-end:
 *
 *   1. The schema migrated correctly (FKs, charset, composite PK).
 *   2. `prisma generate` produced a working client (we use `upsert`).
 *   3. The DB accepts emoji in display names (utf8mb4 sanity check).
 *
 * No users, roles, or permissions are created — those land with the Auth
 * and RBAC sprints. The canary slug is reserved (`canary`) so future
 * `--prod-core` seeds against staging can detect "is this the canary
 * tenant?" without a migration.
 *
 * Idempotent: re-running upserts the same row.
 */
import type { PrismaClient } from '@prisma/client';

const CANARY_SLUG = 'canary';
const CANARY_DISPLAY_NAME = 'Canary School (demo) 🌱';

export async function applyCanaryTenant(prisma: PrismaClient): Promise<void> {
  const school = await prisma.school.upsert({
    where: { slug: CANARY_SLUG },
    update: {
      displayName: CANARY_DISPLAY_NAME,
      legalName: 'Canary School Trust',
      status: 'active',
      onboardedAt: new Date(),
    },
    create: {
      slug: CANARY_SLUG,
      legalName: 'Canary School Trust',
      displayName: CANARY_DISPLAY_NAME,
      countryCode: 'IN',
      city: 'Bengaluru',
      stateCode: 'KA',
      pincode: '560001',
      timezone: 'Asia/Kolkata',
      localeDefault: 'en-IN',
      status: 'active',
      onboardedAt: new Date(),
    },
  });

  // SchoolSettings has a composite PK (schoolId, id). Prisma's `upsert`
  // requires a single unique field for `where`, so we use the
  // `(schoolId)` unique constraint we declared on the table.
  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: {
      schoolId: school.id,
      workingDaysJson: {
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: true,
        sun: false,
      },
      attendanceWindowHours: 24,
      examEditWindowHours: 48,
      invoiceNumberFormat: 'INV/{FY}/{SEQ}',
      defaultCommunicationLanguage: 'en-IN',
      quietHoursStart: '21:00:00',
      quietHoursEnd: '07:00:00',
    },
  });
}

export async function verifyCanaryTenant(prisma: PrismaClient): Promise<void> {
  const school = await prisma.school.findUnique({ where: { slug: CANARY_SLUG } });
  if (school === null) {
    throw new Error(`canary-tenant verify failed: no school with slug="${CANARY_SLUG}".`);
  }
  if (!school.displayName.includes('🌱')) {
    throw new Error('canary-tenant verify failed: utf8mb4 round-trip lost the emoji marker.');
  }
  const settings = await prisma.schoolSettings.findFirst({ where: { schoolId: school.id } });
  if (settings === null) {
    throw new Error('canary-tenant verify failed: school_settings row missing.');
  }
}
