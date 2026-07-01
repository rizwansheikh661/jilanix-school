import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { JobDefinitionRow } from '../jobs.types';

export interface CreateJobDefinitionInput {
  readonly id: string;
  readonly schoolId: string | null;
  readonly name: string;
  readonly queue: string;
  readonly handlerName: string;
  readonly scheduleCron: string | null;
  readonly payloadTemplate?: Prisma.InputJsonValue;
  readonly isActive: boolean;
  readonly description: string | null;
  readonly createdBy: string | null;
}

export interface UpdateJobDefinitionInput {
  readonly queue?: string;
  readonly handlerName?: string;
  readonly scheduleCron?: string | null;
  readonly payloadTemplate?: Prisma.InputJsonValue | null;
  readonly description?: string | null;
  readonly isActive?: boolean;
  readonly updatedBy: string | null;
}

export interface ListJobDefinitionsArgs {
  readonly schoolId?: string | null;
  readonly queue?: string;
  readonly isActive?: boolean;
  readonly limit: number;
}

@Injectable()
export class JobDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(input: CreateJobDefinitionInput, tx?: PrismaTx): Promise<JobDefinitionRow> {
    const c = this.client(tx);
    const row = await c.jobDefinition.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        name: input.name,
        queue: input.queue,
        handlerName: input.handlerName,
        scheduleCron: input.scheduleCron,
        ...(input.payloadTemplate !== undefined ? { payloadTemplate: input.payloadTemplate } : {}),
        isActive: input.isActive,
        description: input.description,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return mapRow(row);
  }

  public async findById(id: string): Promise<JobDefinitionRow | null> {
    const c = this.client();
    const row = await c.jobDefinition.findUnique({ where: { id } });
    return row === null ? null : mapRow(row);
  }

  public async findByName(schoolId: string | null, name: string): Promise<JobDefinitionRow | null> {
    const c = this.client();
    const row = await c.jobDefinition.findFirst({ where: { schoolId, name } });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListJobDefinitionsArgs): Promise<readonly JobDefinitionRow[]> {
    const c = this.client();
    const where: Prisma.JobDefinitionWhereInput = {};
    if (args.schoolId !== undefined) where.schoolId = args.schoolId;
    if (args.queue !== undefined) where.queue = args.queue;
    if (args.isActive !== undefined) where.isActive = args.isActive;
    const rows = await c.jobDefinition.findMany({
      where,
      orderBy: [{ queue: 'asc' }, { name: 'asc' }],
      take: args.limit,
    });
    return rows.map(mapRow);
  }

  public async listActiveScheduled(): Promise<readonly JobDefinitionRow[]> {
    const c = this.client();
    const rows = await c.jobDefinition.findMany({
      where: { isActive: true, scheduleCron: { not: null } },
    });
    return rows.map(mapRow);
  }

  public async update(id: string, input: UpdateJobDefinitionInput, expectedVersion?: number): Promise<JobDefinitionRow | null> {
    const c = this.client();
    const data: Prisma.JobDefinitionUncheckedUpdateInput = {
      updatedBy: input.updatedBy,
      version: { increment: 1 },
    };
    if (input.queue !== undefined) data.queue = input.queue;
    if (input.handlerName !== undefined) data.handlerName = input.handlerName;
    if (input.scheduleCron !== undefined) data.scheduleCron = input.scheduleCron;
    if (input.payloadTemplate !== undefined) {
      data.payloadTemplate = input.payloadTemplate === null ? Prisma.DbNull : input.payloadTemplate;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const where: Prisma.JobDefinitionWhereUniqueInput = { id };
    if (expectedVersion !== undefined) where.version = expectedVersion;
    try {
      const row = await c.jobDefinition.update({ where, data });
      return mapRow(row);
    } catch {
      return null;
    }
  }

  public async delete(id: string): Promise<number> {
    const c = this.client();
    const result = await c.jobDefinition.deleteMany({ where: { id } });
    return result.count;
  }
}

interface Raw {
  id: string;
  schoolId: string | null;
  name: string;
  queue: string;
  handlerName: string;
  scheduleCron: string | null;
  payloadTemplate: Prisma.JsonValue | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(r: Raw): JobDefinitionRow {
  return {
    id: r.id,
    schoolId: r.schoolId,
    name: r.name,
    queue: r.queue,
    handlerName: r.handlerName,
    scheduleCron: r.scheduleCron,
    payloadTemplate: r.payloadTemplate,
    isActive: r.isActive,
    description: r.description,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    version: r.version,
  };
}

