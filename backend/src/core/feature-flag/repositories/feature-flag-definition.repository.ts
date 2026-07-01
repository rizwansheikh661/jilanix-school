import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type {
  FeatureFlagDefinitionRow,
  FeatureFlagKind,
  FeatureFlagLifecycle,
} from '../feature-flag.types';

export interface CreateFlagDefinitionInput {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: FeatureFlagKind;
  readonly owner: string | null;
  readonly defaultValue: boolean;
  readonly lifecycle: FeatureFlagLifecycle;
  readonly cleanupDueAt: Date | null;
  readonly createdBy: string | null;
}

export interface UpdateFlagDefinitionInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly kind?: FeatureFlagKind;
  readonly owner?: string | null;
  readonly defaultValue?: boolean;
  readonly lifecycle?: FeatureFlagLifecycle;
  readonly cleanupDueAt?: Date | null;
  readonly updatedBy: string | null;
}

@Injectable()
export class FeatureFlagDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateFlagDefinitionInput, tx?: PrismaTx): Promise<FeatureFlagDefinitionRow> {
    const c = this.client(tx);
    const row = await c.featureFlagDefinition.create({
      data: {
        id: input.id,
        key: input.key,
        name: input.name,
        description: input.description,
        kind: input.kind,
        owner: input.owner,
        defaultValue: input.defaultValue,
        lifecycle: input.lifecycle,
        cleanupDueAt: input.cleanupDueAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async upsertByKey(input: CreateFlagDefinitionInput, tx?: PrismaTx): Promise<FeatureFlagDefinitionRow> {
    const c = this.client(tx);
    const row = await c.featureFlagDefinition.upsert({
      where: { key: input.key },
      update: {
        name: input.name,
        description: input.description,
        kind: input.kind,
        owner: input.owner,
        updatedBy: input.createdBy,
      },
      create: {
        id: input.id,
        key: input.key,
        name: input.name,
        description: input.description,
        kind: input.kind,
        owner: input.owner,
        defaultValue: input.defaultValue,
        lifecycle: input.lifecycle,
        cleanupDueAt: input.cleanupDueAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<FeatureFlagDefinitionRow | null> {
    const row = await this.client().featureFlagDefinition.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async findByKey(key: string): Promise<FeatureFlagDefinitionRow | null> {
    const row = await this.client().featureFlagDefinition.findUnique({ where: { key } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: { kind?: FeatureFlagKind; lifecycle?: FeatureFlagLifecycle; limit: number }): Promise<readonly FeatureFlagDefinitionRow[]> {
    const where: Prisma.FeatureFlagDefinitionWhereInput = {};
    if (args.kind !== undefined) where.kind = args.kind;
    if (args.lifecycle !== undefined) where.lifecycle = args.lifecycle;
    const rows = await this.client().featureFlagDefinition.findMany({
      where,
      orderBy: { key: 'asc' },
      take: args.limit,
    });
    return rows.map(mapRow);
  }

  public async listAll(): Promise<readonly FeatureFlagDefinitionRow[]> {
    const rows = await this.client().featureFlagDefinition.findMany();
    return rows.map(mapRow);
  }

  public async update(id: string, input: UpdateFlagDefinitionInput, expectedVersion?: number): Promise<FeatureFlagDefinitionRow | null> {
    const data: Prisma.FeatureFlagDefinitionUncheckedUpdateInput = {
      updatedBy: input.updatedBy,
      version: { increment: 1 },
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.owner !== undefined) data.owner = input.owner;
    if (input.defaultValue !== undefined) data.defaultValue = input.defaultValue;
    if (input.lifecycle !== undefined) data.lifecycle = input.lifecycle;
    if (input.cleanupDueAt !== undefined) data.cleanupDueAt = input.cleanupDueAt;

    const where: Prisma.FeatureFlagDefinitionWhereUniqueInput = { id };
    if (expectedVersion !== undefined) where.version = expectedVersion;
    try {
      const row = await this.client().featureFlagDefinition.update({ where, data });
      return mapRow(row);
    } catch {
      return null;
    }
  }

  public async delete(id: string): Promise<number> {
    const result = await this.client().featureFlagDefinition.deleteMany({ where: { id } });
    return result.count;
  }
}

interface Raw {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: FeatureFlagKind;
  owner: string | null;
  defaultValue: boolean;
  lifecycle: FeatureFlagLifecycle;
  cleanupDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(r: Raw): FeatureFlagDefinitionRow {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    kind: r.kind,
    owner: r.owner,
    defaultValue: r.defaultValue,
    lifecycle: r.lifecycle,
    cleanupDueAt: r.cleanupDueAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}
