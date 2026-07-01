import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { FeatureFlagAuditRow } from '../feature-flag.types';

export interface CreateAuditInput {
  readonly schoolId: string | null;
  readonly flagId: string;
  readonly scope: string;
  readonly beforeValue?: Prisma.InputJsonValue;
  readonly afterValue?: Prisma.InputJsonValue;
  readonly actorUserId: string | null;
  readonly reason: string | null;
}

@Injectable()
export class FeatureFlagAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async append(input: CreateAuditInput, tx?: PrismaTx): Promise<FeatureFlagAuditRow> {
    const c = this.client(tx);
    const row = await c.featureFlagAuditLog.create({
      data: {
        id: ulid(),
        schoolId: input.schoolId,
        flagId: input.flagId,
        scope: input.scope,
        ...(input.beforeValue !== undefined ? { beforeValue: input.beforeValue } : {}),
        ...(input.afterValue !== undefined ? { afterValue: input.afterValue } : {}),
        actorUserId: input.actorUserId,
        reason: input.reason,
      },
    });
    return mapRow(row);
  }

  public async list(args: { flagId?: string; schoolId?: string | null; since?: Date; limit: number }): Promise<readonly FeatureFlagAuditRow[]> {
    const where: Prisma.FeatureFlagAuditLogWhereInput = {};
    if (args.flagId !== undefined) where.flagId = args.flagId;
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.since !== undefined) where.createdAt = { gte: args.since };
    const rows = await this.client().featureFlagAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }
}

interface Raw {
  id: string;
  schoolId: string | null;
  flagId: string;
  scope: string;
  beforeValue: Prisma.JsonValue | null;
  afterValue: Prisma.JsonValue | null;
  actorUserId: string | null;
  reason: string | null;
  createdAt: Date;
}

function mapRow(r: Raw): FeatureFlagAuditRow {
  return {
    id: r.id,
    schoolId: r.schoolId,
    flagId: r.flagId,
    scope: r.scope,
    beforeValue: r.beforeValue,
    afterValue: r.afterValue,
    actorUserId: r.actorUserId,
    reason: r.reason,
    createdAt: r.createdAt,
  };
}
