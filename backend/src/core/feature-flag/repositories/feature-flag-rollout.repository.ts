import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { FeatureFlagRolloutRow, RolloutStrategy } from '../feature-flag.types';

export interface CreateRolloutInput {
  readonly id: string;
  readonly flagId: string;
  readonly strategy: RolloutStrategy;
  readonly percentage: number | null;
  readonly tenantIdsJson?: Prisma.InputJsonValue;
  readonly planIdsJson?: Prisma.InputJsonValue;
  readonly regionsJson?: Prisma.InputJsonValue;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly createdBy: string | null;
}

export interface UpdateRolloutInput {
  readonly percentage?: number | null;
  readonly tenantIdsJson?: Prisma.InputJsonValue | null;
  readonly planIdsJson?: Prisma.InputJsonValue | null;
  readonly regionsJson?: Prisma.InputJsonValue | null;
  readonly isActive?: boolean;
  readonly startsAt?: Date | null;
  readonly endsAt?: Date | null;
  readonly updatedBy: string | null;
}

@Injectable()
export class FeatureFlagRolloutRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateRolloutInput, tx?: PrismaTx): Promise<FeatureFlagRolloutRow> {
    const c = this.client(tx);
    const row = await c.featureFlagRollout.create({
      data: {
        id: input.id,
        flagId: input.flagId,
        strategy: input.strategy,
        percentage: input.percentage,
        ...(input.tenantIdsJson !== undefined ? { tenantIdsJson: input.tenantIdsJson } : {}),
        ...(input.planIdsJson !== undefined ? { planIdsJson: input.planIdsJson } : {}),
        ...(input.regionsJson !== undefined ? { regionsJson: input.regionsJson } : {}),
        isActive: input.isActive,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<FeatureFlagRolloutRow | null> {
    const row = await this.client().featureFlagRollout.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async listActiveForFlag(flagId: string, now: Date): Promise<readonly FeatureFlagRolloutRow[]> {
    const rows = await this.client().featureFlagRollout.findMany({
      where: {
        flagId,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapRow);
  }

  public async list(args: { flagId?: string; isActive?: boolean; limit: number }): Promise<readonly FeatureFlagRolloutRow[]> {
    const where: Prisma.FeatureFlagRolloutWhereInput = {};
    if (args.flagId !== undefined) where.flagId = args.flagId;
    if (args.isActive !== undefined) where.isActive = args.isActive;
    const rows = await this.client().featureFlagRollout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }

  public async update(id: string, input: UpdateRolloutInput, expectedVersion?: number): Promise<FeatureFlagRolloutRow | null> {
    const data: Prisma.FeatureFlagRolloutUncheckedUpdateInput = {
      updatedBy: input.updatedBy,
      version: { increment: 1 },
    };
    if (input.percentage !== undefined) data.percentage = input.percentage;
    if (input.tenantIdsJson !== undefined) {
      data.tenantIdsJson = input.tenantIdsJson === null ? Prisma.DbNull : input.tenantIdsJson;
    }
    if (input.planIdsJson !== undefined) {
      data.planIdsJson = input.planIdsJson === null ? Prisma.DbNull : input.planIdsJson;
    }
    if (input.regionsJson !== undefined) {
      data.regionsJson = input.regionsJson === null ? Prisma.DbNull : input.regionsJson;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt;

    const where: Prisma.FeatureFlagRolloutWhereUniqueInput = { id };
    if (expectedVersion !== undefined) where.version = expectedVersion;
    try {
      const row = await this.client().featureFlagRollout.update({ where, data });
      return mapRow(row);
    } catch {
      return null;
    }
  }

  public async delete(id: string): Promise<number> {
    const result = await this.client().featureFlagRollout.deleteMany({ where: { id } });
    return result.count;
  }
}

interface Raw {
  id: string;
  flagId: string;
  strategy: RolloutStrategy;
  percentage: number | null;
  tenantIdsJson: Prisma.JsonValue | null;
  planIdsJson: Prisma.JsonValue | null;
  regionsJson: Prisma.JsonValue | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): FeatureFlagRolloutRow {
  return {
    id: r.id,
    flagId: r.flagId,
    strategy: r.strategy,
    percentage: r.percentage,
    tenantIdsJson: r.tenantIdsJson,
    planIdsJson: r.planIdsJson,
    regionsJson: r.regionsJson,
    isActive: r.isActive,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}
