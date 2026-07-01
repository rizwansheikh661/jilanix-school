/**
 * PlanRepository — persistence for the `plans` table (PLATFORM_ONLY, soft-
 * delete, version-guarded).
 *
 * No tenant scope — Plan is platform-level. `assertScopesCoverGeneratedClient`
 * registers `Plan: 'PLATFORM_ONLY'` so the tenant-scope extension never
 * stamps a where-clause on these queries.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { PlanRow } from '../provisioning.types';

export interface CreatePlanInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly defaultTrialDays?: number;
  readonly emailEnabled?: boolean;
  readonly smsEnabled?: boolean;
  readonly pushEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly emailMonthlyLimit?: number;
  readonly smsMonthlyLimit?: number;
  readonly pushMonthlyLimit?: number;
  readonly inAppMonthlyLimit?: number;
}

export interface UpdatePlanInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly defaultTrialDays?: number;
  readonly emailEnabled?: boolean;
  readonly smsEnabled?: boolean;
  readonly pushEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly emailMonthlyLimit?: number;
  readonly smsMonthlyLimit?: number;
  readonly pushMonthlyLimit?: number;
  readonly inAppMonthlyLimit?: number;
}

export interface ListPlansArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly includeDeleted?: boolean;
}

@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    const ctx = RequestContextRegistry.peek();
    return ctx?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<PlanRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.plan.findFirst({
      where: { id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawPlan);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<PlanRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.plan.findFirst({
      where: { code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawPlan);
  }

  public async list(
    args: ListPlansArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly PlanRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = {};
    if (args.includeDeleted !== true) where.deletedAt = null;
    const rows = await reader.plan.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { id: args.cursorId }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawPlan)),
      nextCursorId,
    };
  }

  public async create(input: CreatePlanInput, tx?: PrismaTx): Promise<PlanRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      defaultTrialDays: input.defaultTrialDays ?? 30,
      emailEnabled: input.emailEnabled ?? true,
      smsEnabled: input.smsEnabled ?? false,
      pushEnabled: input.pushEnabled ?? true,
      inAppEnabled: input.inAppEnabled ?? true,
      emailMonthlyLimit: input.emailMonthlyLimit ?? 0,
      smsMonthlyLimit: input.smsMonthlyLimit ?? 0,
      pushMonthlyLimit: input.pushMonthlyLimit ?? 0,
      inAppMonthlyLimit: input.inAppMonthlyLimit ?? 0,
      createdBy: userId,
      updatedBy: userId,
    };
    const created = await writer.plan.create({ data: data as never });
    return mapRow(created as unknown as RawPlan);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePlanInput,
    tx?: PrismaTx,
  ): Promise<PlanRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    const fields: ReadonlyArray<keyof UpdatePlanInput> = [
      'name',
      'description',
      'defaultTrialDays',
      'emailEnabled',
      'smsEnabled',
      'pushEnabled',
      'inAppEnabled',
      'emailMonthlyLimit',
      'smsMonthlyLimit',
      'pushMonthlyLimit',
      'inAppMonthlyLimit',
    ];
    for (const k of fields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.plan.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Plan', id, expectedVersion);
    }
    const reloaded = await writer.plan.findUnique({ where: { id } });
    if (reloaded === null) {
      throw new VersionConflictError('Plan', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawPlan);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.plan.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Plan', id, expectedVersion);
    }
  }

  public async countSchoolsUsing(
    planId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    return reader.school.count({ where: { planId, deletedAt: null } });
  }

  public async upsertByCode(
    input: CreatePlanInput,
    tx?: PrismaTx,
  ): Promise<PlanRow> {
    const writer = this.resolve(tx);
    const existing = await writer.plan.findFirst({ where: { code: input.code } });
    if (existing === null) {
      return this.create(input, tx);
    }
    if (existing.deletedAt !== null) {
      // Resurrect retired plan to current defaults — keeps the seeder
      // idempotent if a plan was soft-deleted by mistake.
      const restored = await writer.plan.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          version: { increment: 1 },
        },
      });
      return mapRow(restored as unknown as RawPlan);
    }
    return mapRow(existing as unknown as RawPlan);
  }
}

interface RawPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultTrialDays: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailMonthlyLimit: number;
  smsMonthlyLimit: number;
  pushMonthlyLimit: number;
  inAppMonthlyLimit: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function mapRow(row: RawPlan): PlanRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    defaultTrialDays: row.defaultTrialDays,
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    pushEnabled: row.pushEnabled,
    inAppEnabled: row.inAppEnabled,
    emailMonthlyLimit: row.emailMonthlyLimit,
    smsMonthlyLimit: row.smsMonthlyLimit,
    pushMonthlyLimit: row.pushMonthlyLimit,
    inAppMonthlyLimit: row.inAppMonthlyLimit,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
