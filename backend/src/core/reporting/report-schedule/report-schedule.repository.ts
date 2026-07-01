/**
 * ReportScheduleRepository — persistence for `report_schedules` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. update / patchToggle are
 * guarded `updateMany` calls so concurrent mutations short-circuit via
 * VersionConflictError.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ReportFormatValue,
  ReportKindValue,
  ReportScheduleFrequencyValue,
} from '../reporting.constants';
import type { ReportScheduleRow, ScheduleRecipient } from '../reporting.types';

export interface CreateReportScheduleInput {
  readonly code: string;
  readonly name: string;
  readonly reportKind: ReportKindValue;
  readonly format: ReportFormatValue;
  readonly frequency: ReportScheduleFrequencyValue;
  readonly cron: string;
  readonly params: Record<string, unknown>;
  readonly recipients: readonly ScheduleRecipient[];
  readonly ownedByUserId: string;
  readonly nextRunAt: Date | null;
}

export interface UpdateReportScheduleInput {
  readonly name?: string;
  readonly reportKind?: ReportKindValue;
  readonly format?: ReportFormatValue;
  readonly frequency?: ReportScheduleFrequencyValue;
  readonly cron?: string;
  readonly params?: Record<string, unknown>;
  readonly recipients?: readonly ScheduleRecipient[];
  readonly nextRunAt?: Date | null;
}

export interface ListReportSchedulesArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly reportKind?: ReportKindValue;
  readonly isEnabled?: boolean;
  readonly ownedByUserId?: string;
}

@Injectable()
export class ReportScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportScheduleRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<ReportScheduleRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportSchedule.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportSchedule);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<ReportScheduleRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.reportSchedule.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawReportSchedule);
  }

  public async list(
    args: ListReportSchedulesArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ReportScheduleRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.reportKind !== undefined) where.reportKind = args.reportKind;
    if (args.isEnabled !== undefined) where.isEnabled = args.isEnabled;
    if (args.ownedByUserId !== undefined) {
      where.ownedByUserId = args.ownedByUserId;
    }
    const rows = await reader.reportSchedule.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawReportSchedule)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateReportScheduleInput,
    tx?: PrismaTx,
  ): Promise<ReportScheduleRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      schoolId,
      code: input.code,
      name: input.name,
      reportKind: input.reportKind,
      format: input.format,
      frequency: input.frequency,
      cron: input.cron,
      params: input.params as Prisma.InputJsonValue,
      recipients: input.recipients as unknown as Prisma.InputJsonValue,
      isEnabled: true,
      nextRunAt: input.nextRunAt,
      ownedByUserId: input.ownedByUserId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    };
    const created = await writer.reportSchedule.create({
      data: data as never,
    });
    return mapRow(created as unknown as RawReportSchedule);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateReportScheduleInput,
    tx?: PrismaTx,
  ): Promise<ReportScheduleRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.reportKind !== undefined) data.reportKind = patch.reportKind;
    if (patch.format !== undefined) data.format = patch.format;
    if (patch.frequency !== undefined) data.frequency = patch.frequency;
    if (patch.cron !== undefined) data.cron = patch.cron;
    if (patch.params !== undefined) {
      data.params = patch.params as Prisma.InputJsonValue;
    }
    if (patch.recipients !== undefined) {
      data.recipients = patch.recipients as unknown as Prisma.InputJsonValue;
    }
    if (patch.nextRunAt !== undefined) data.nextRunAt = patch.nextRunAt;
    const result = await writer.reportSchedule.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportSchedule', id, expectedVersion);
    }
    const reloaded = await writer.reportSchedule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ReportSchedule', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawReportSchedule);
  }

  public async patchToggle(
    id: string,
    expectedVersion: number,
    isEnabled: boolean,
    tx?: PrismaTx,
  ): Promise<ReportScheduleRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.reportSchedule.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        isEnabled,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportSchedule', id, expectedVersion);
    }
    const reloaded = await writer.reportSchedule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ReportSchedule', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawReportSchedule);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.reportSchedule.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ReportSchedule', id, expectedVersion);
    }
  }
}

interface RawReportSchedule {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  reportKind: string;
  format: string;
  frequency: string;
  cron: string;
  params: unknown;
  recipients: unknown;
  isEnabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastReportRunId: string | null;
  ownedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawReportSchedule): ReportScheduleRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    reportKind: row.reportKind as ReportScheduleRow['reportKind'],
    format: row.format as ReportScheduleRow['format'],
    frequency: row.frequency as ReportScheduleRow['frequency'],
    cron: row.cron,
    params: (row.params ?? {}) as Record<string, unknown>,
    recipients: (Array.isArray(row.recipients)
      ? row.recipients
      : []) as readonly ScheduleRecipient[],
    isEnabled: row.isEnabled,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastReportRunId: row.lastReportRunId,
    ownedByUserId: row.ownedByUserId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
