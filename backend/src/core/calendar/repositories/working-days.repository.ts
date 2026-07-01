import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SessionTypeValue } from '../calendar.constants';
import type { WorkingDaysConfigurationRow } from '../calendar.types';

export interface CreateWorkingDaysConfigurationInput {
  readonly branchId?: string | null;
  readonly dayOfWeek: number;
  readonly isWorking: boolean;
  readonly sessionType?: SessionTypeValue;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
  readonly note?: string | null;
}

@Injectable()
export class WorkingDaysConfigurationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('WorkingDaysConfigurationRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async listForBranch(
    args: { branchId: string | null; date?: Date },
    tx?: PrismaTx,
  ): Promise<readonly WorkingDaysConfigurationRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      branchId: args.branchId,
    };
    if (args.date !== undefined) {
      where.effectiveFrom = { lte: args.date };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: args.date } }];
    }
    const rows = await reader.workingDaysConfiguration.findMany({
      where,
      orderBy: [{ dayOfWeek: 'asc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map(map);
  }

  public async findActive(
    args: { branchId: string | null; dayOfWeek: number; date: Date },
    tx?: PrismaTx,
  ): Promise<WorkingDaysConfigurationRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.workingDaysConfiguration.findFirst({
      where: {
        schoolId,
        branchId: args.branchId,
        dayOfWeek: args.dayOfWeek,
        effectiveFrom: { lte: args.date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: args.date } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }],
    });
    return row === null ? null : map(row);
  }

  public async findOpenForKey(
    args: { branchId: string | null; dayOfWeek: number },
    tx?: PrismaTx,
  ): Promise<WorkingDaysConfigurationRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.workingDaysConfiguration.findFirst({
      where: {
        schoolId,
        branchId: args.branchId,
        dayOfWeek: args.dayOfWeek,
        effectiveTo: null,
      },
      orderBy: [{ effectiveFrom: 'desc' }],
    });
    return row === null ? null : map(row);
  }

  public async closeOpenRow(
    args: { id: string; effectiveTo: Date },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.workingDaysConfiguration.updateMany({
      where: { schoolId, id: args.id, effectiveTo: null },
      data: {
        effectiveTo: args.effectiveTo,
        updatedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
  }

  public async create(
    input: CreateWorkingDaysConfigurationInput,
    tx?: PrismaTx,
  ): Promise<WorkingDaysConfigurationRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.workingDaysConfiguration.create({
      data: {
        schoolId,
        branchId: input.branchId ?? null,
        dayOfWeek: input.dayOfWeek,
        isWorking: input.isWorking,
        sessionType: input.sessionType ?? 'FULL',
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        note: input.note ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }
}

interface RawWdc {
  id: string;
  schoolId: string;
  branchId: string | null;
  dayOfWeek: number;
  isWorking: boolean;
  sessionType: SessionTypeValue;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawWdc): WorkingDaysConfigurationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    dayOfWeek: row.dayOfWeek,
    isWorking: row.isWorking,
    sessionType: row.sessionType,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
