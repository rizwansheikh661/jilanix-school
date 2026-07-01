import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { BranchSettingsRow } from '../branch.types';

export interface UpsertBranchSettingsInput {
  readonly workingDaysJson?: unknown | null;
  readonly periodSettingsJson?: unknown | null;
  readonly attendanceWindowOverrideHours?: number | null;
  readonly primaryLanguage?: string | null;
}

@Injectable()
export class BranchSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('BranchSettingsRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findByBranch(branchId: string, tx?: PrismaTx): Promise<BranchSettingsRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.branchSettings.findUnique({
      where: { schoolId_branchId: { schoolId, branchId } },
    });
    return row === null ? null : map(row);
  }

  public async upsert(
    branchId: string,
    expectedVersion: number | null,
    input: UpsertBranchSettingsInput,
    tx?: PrismaTx,
  ): Promise<BranchSettingsRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const existing = await writer.branchSettings.findUnique({
      where: { schoolId_branchId: { schoolId, branchId } },
    });
    if (existing === null) {
      const created = await writer.branchSettings.create({
        data: {
          schoolId,
          branchId,
          workingDaysJson: (input.workingDaysJson ?? null) as never,
          periodSettingsJson: (input.periodSettingsJson ?? null) as never,
          attendanceWindowOverrideHours: input.attendanceWindowOverrideHours ?? null,
          primaryLanguage: input.primaryLanguage ?? null,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      return map(created);
    }
    if (expectedVersion === null || existing.version !== expectedVersion) {
      throw new VersionConflictError('BranchSettings', branchId, expectedVersion ?? 0);
    }
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.workingDaysJson !== undefined) data.workingDaysJson = input.workingDaysJson;
    if (input.periodSettingsJson !== undefined) data.periodSettingsJson = input.periodSettingsJson;
    if (input.attendanceWindowOverrideHours !== undefined)
      data.attendanceWindowOverrideHours = input.attendanceWindowOverrideHours;
    if (input.primaryLanguage !== undefined) data.primaryLanguage = input.primaryLanguage;
    const result = await writer.branchSettings.updateMany({
      where: { schoolId, branchId, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('BranchSettings', branchId, expectedVersion);
    }
    const updated = await writer.branchSettings.findUnique({
      where: { schoolId_branchId: { schoolId, branchId } },
    });
    if (updated === null) {
      throw new VersionConflictError('BranchSettings', branchId, expectedVersion);
    }
    return map(updated);
  }
}

void randomUUID;

interface RawBranchSettings {
  schoolId: string;
  branchId: string;
  workingDaysJson: unknown;
  periodSettingsJson: unknown;
  attendanceWindowOverrideHours: number | null;
  primaryLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawBranchSettings): BranchSettingsRow {
  return {
    schoolId: row.schoolId,
    branchId: row.branchId,
    workingDaysJson: row.workingDaysJson === null ? null : row.workingDaysJson,
    periodSettingsJson: row.periodSettingsJson === null ? null : row.periodSettingsJson,
    attendanceWindowOverrideHours: row.attendanceWindowOverrideHours,
    primaryLanguage: row.primaryLanguage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
