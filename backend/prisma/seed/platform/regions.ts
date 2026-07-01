/**
 * Region reference data.
 *
 * Initial set: the country (`IN`) and the most populous Indian states. The
 * full ISO 3166-2:IN catalogue is loaded via a CSV fixture in a later
 * sprint; this seed only needs enough rows to satisfy referential checks
 * on `schools.country_code` and `schools.state_code` for the canary tenant.
 */
import type { PrismaClient } from '@prisma/client';

interface RegionSeed {
  readonly code: string;
  readonly name: string;
  readonly parentCode?: string;
}

const REGIONS: readonly RegionSeed[] = [
  { code: 'IN', name: 'India' },
  { code: 'KA', name: 'Karnataka', parentCode: 'IN' },
  { code: 'MH', name: 'Maharashtra', parentCode: 'IN' },
  { code: 'TN', name: 'Tamil Nadu', parentCode: 'IN' },
  { code: 'DL', name: 'Delhi', parentCode: 'IN' },
  { code: 'TG', name: 'Telangana', parentCode: 'IN' },
];

export async function applyRegions(prisma: PrismaClient): Promise<void> {
  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: { name: region.name, parentCode: region.parentCode ?? null, isActive: true },
      create: {
        code: region.code,
        name: region.name,
        parentCode: region.parentCode ?? null,
        isActive: true,
      },
    });
  }
}

export async function verifyRegions(prisma: PrismaClient): Promise<void> {
  const count = await prisma.region.count({ where: { isActive: true } });
  if (count < REGIONS.length) {
    throw new Error(
      `regions verify failed: expected at least ${REGIONS.length} active rows, found ${count}.`,
    );
  }
}
