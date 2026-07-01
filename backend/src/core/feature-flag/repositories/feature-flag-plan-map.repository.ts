import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { FeatureFlagPlanMapRow } from '../feature-flag.types';

export interface CreatePlanMapInput {
  readonly id: string;
  readonly planId: string;
  readonly flagId: string;
  readonly value: boolean;
  readonly quotaInt: number | null;
  readonly quotaWindow: string | null;
  readonly createdBy: string | null;
}

@Injectable()
export class FeatureFlagPlanMapRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreatePlanMapInput, tx?: PrismaTx): Promise<FeatureFlagPlanMapRow> {
    const c = this.client(tx);
    const row = await c.featureFlagPlanMap.create({
      data: {
        id: input.id,
        planId: input.planId,
        flagId: input.flagId,
        value: input.value,
        quotaInt: input.quotaInt,
        quotaWindow: input.quotaWindow,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async findByPlanAndFlag(planId: string, flagId: string): Promise<FeatureFlagPlanMapRow | null> {
    const row = await this.client().featureFlagPlanMap.findFirst({
      where: { planId, flagId },
    });
    return row === null ? null : mapRow(row);
  }

  public async listForPlan(planId: string): Promise<readonly FeatureFlagPlanMapRow[]> {
    const rows = await this.client().featureFlagPlanMap.findMany({ where: { planId } });
    return rows.map(mapRow);
  }

  public async listForFlag(flagId: string): Promise<readonly FeatureFlagPlanMapRow[]> {
    const rows = await this.client().featureFlagPlanMap.findMany({ where: { flagId } });
    return rows.map(mapRow);
  }
}

interface Raw {
  id: string;
  planId: string;
  flagId: string;
  value: boolean;
  quotaInt: number | null;
  quotaWindow: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): FeatureFlagPlanMapRow {
  return {
    id: r.id,
    planId: r.planId,
    flagId: r.flagId,
    value: r.value,
    quotaInt: r.quotaInt,
    quotaWindow: r.quotaWindow,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}
