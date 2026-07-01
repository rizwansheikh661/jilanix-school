import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { FeatureFlagTenantOverrideRow } from '../feature-flag.types';

export interface UpsertOverrideInput {
  readonly id: string;
  readonly schoolId: string;
  readonly flagId: string;
  readonly value: boolean;
  readonly quotaInt: number | null;
  readonly reason: string | null;
  readonly setBy: string | null;
  readonly expiresAt: Date | null;
}

@Injectable()
export class FeatureFlagTenantOverrideRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: UpsertOverrideInput, tx?: PrismaTx): Promise<FeatureFlagTenantOverrideRow> {
    const c = this.client(tx);
    const row = await c.featureFlagTenantOverride.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        flagId: input.flagId,
        value: input.value,
        quotaInt: input.quotaInt,
        reason: input.reason,
        setBy: input.setBy,
        setAt: new Date(),
        expiresAt: input.expiresAt,
        createdBy: input.setBy,
        updatedBy: input.setBy,
      },
    });
    return mapRow(row);
  }

  public async findActive(schoolId: string, flagId: string, now: Date): Promise<FeatureFlagTenantOverrideRow | null> {
    const row = await this.client().featureFlagTenantOverride.findFirst({
      where: {
        schoolId,
        flagId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { setAt: 'desc' },
    });
    return row === null ? null : mapRow(row);
  }

  public async listForSchool(schoolId: string): Promise<readonly FeatureFlagTenantOverrideRow[]> {
    const rows = await this.client().featureFlagTenantOverride.findMany({
      where: { schoolId },
      orderBy: { setAt: 'desc' },
    });
    return rows.map(mapRow);
  }

  public async deleteForSchoolFlag(schoolId: string, flagId: string): Promise<number> {
    const result = await this.client().featureFlagTenantOverride.deleteMany({
      where: { schoolId, flagId },
    });
    return result.count;
  }
}

interface Raw {
  id: string;
  schoolId: string;
  flagId: string;
  value: boolean;
  quotaInt: number | null;
  reason: string | null;
  setBy: string | null;
  setAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): FeatureFlagTenantOverrideRow {
  return {
    id: r.id,
    schoolId: r.schoolId,
    flagId: r.flagId,
    value: r.value,
    quotaInt: r.quotaInt,
    reason: r.reason,
    setBy: r.setBy,
    setAt: r.setAt,
    expiresAt: r.expiresAt,
    version: r.version,
  };
}
