/**
 * PeriodTemplateRepository — persistence for `period_templates` headers
 * and their `period_template_periods` child rows.
 *
 * The header is soft-deleted (`deletedAt`) + version-checked via
 * `updateMany`. Children cascade with the header at the DB layer; the
 * `replacePeriods` helper performs a tx-scoped delete-then-create swap
 * used by the update endpoint.
 *
 * `days` is exposed as `number[]` to callers; the underlying column is
 * `daysJson` (`Json`) — we parse defensively on read.
 *
 * `findActiveByName` powers the duplicate-name guard (`@(school, branch,
 * year, name)` uniqueness is enforced at the DB layer via the hand-added
 * STORED `deleted_at_key` + `uq_period_tpl_active`).
 *
 * `countActiveReferencingVersions` powers the delete-guard rule: a
 * template referenced by any non-ARCHIVED `TimetableVersion` cannot be
 * removed (§7.2 of Sprint 7 plan).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { PeriodTypeValue } from '../timetable.constants';
import type {
  PeriodTemplatePeriodRow,
  PeriodTemplateRow,
  PeriodTemplateWithPeriods,
} from '../timetable.types';

export interface CreatePeriodInput {
  readonly index: number;
  readonly label: string;
  readonly type: PeriodTypeValue;
  /** `HH:MM[:SS]` 24-hour clock. */
  readonly startTime: string;
  /** `HH:MM[:SS]` 24-hour clock. */
  readonly endTime: string;
}

export interface CreatePeriodTemplateInput {
  readonly branchId: string;
  readonly academicYearId: string;
  readonly name: string;
  readonly description: string | null;
  readonly days: readonly number[];
  readonly isDefault: boolean;
  readonly periods: readonly CreatePeriodInput[];
}

export interface UpdatePeriodTemplateInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly days?: readonly number[];
  readonly isDefault?: boolean;
}

export interface ListPeriodTemplateArgs {
  readonly branchId?: string;
  readonly academicYearId?: string;
  readonly isDefault?: boolean;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class PeriodTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('PeriodTemplateRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<PeriodTemplateWithPeriods | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const header = await reader.periodTemplate.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    if (header === null) return null;
    const periods = await reader.periodTemplatePeriod.findMany({
      where: { schoolId, periodTemplateId: id },
      orderBy: [{ index: 'asc' }],
    });
    return {
      ...mapHeader(header),
      periods: periods.map(mapPeriod),
    };
  }

  public async findActiveByName(
    branchId: string,
    academicYearId: string,
    name: string,
    tx?: PrismaTx,
  ): Promise<PeriodTemplateRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.periodTemplate.findFirst({
      where: { schoolId, branchId, academicYearId, name, deletedAt: null },
    });
    return row === null ? null : mapHeader(row);
  }

  public async list(
    args: ListPeriodTemplateArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly PeriodTemplateWithPeriods[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.isDefault !== undefined) where.isDefault = args.isDefault;
    const headers = await reader.periodTemplate.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = headers.length > args.limit ? (headers.pop()?.id ?? null) : null;
    if (headers.length === 0) return { rows: [], nextCursorId };
    const ids = headers.map((h) => h.id);
    const periods = await reader.periodTemplatePeriod.findMany({
      where: { schoolId, periodTemplateId: { in: ids } },
      orderBy: [{ index: 'asc' }],
    });
    const byTpl = new Map<string, PeriodTemplatePeriodRow[]>();
    for (const p of periods) {
      const arr = byTpl.get(p.periodTemplateId) ?? [];
      arr.push(mapPeriod(p));
      byTpl.set(p.periodTemplateId, arr);
    }
    const rows = headers.map((h) => ({
      ...mapHeader(h),
      periods: byTpl.get(h.id) ?? [],
    }));
    return { rows, nextCursorId };
  }

  public async create(
    input: CreatePeriodTemplateInput,
    tx?: PrismaTx,
  ): Promise<PeriodTemplateWithPeriods> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const header = await writer.periodTemplate.create({
      data: {
        schoolId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        name: input.name,
        description: input.description,
        daysJson: Array.from(input.days) as unknown as object,
        isDefault: input.isDefault,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    const periods: PeriodTemplatePeriodRow[] = [];
    for (const p of input.periods) {
      const created = await writer.periodTemplatePeriod.create({
        data: {
          schoolId,
          periodTemplateId: header.id,
          index: p.index,
          label: p.label,
          type: p.type,
          startTime: timeStringToDate(p.startTime),
          endTime: timeStringToDate(p.endTime),
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      periods.push(mapPeriod(created));
    }
    return { ...mapHeader(header), periods };
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdatePeriodTemplateInput,
    tx?: PrismaTx,
  ): Promise<PeriodTemplateRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.days !== undefined) data.daysJson = Array.from(input.days);
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    const result = await writer.periodTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('PeriodTemplate', id, expectedVersion);
    }
    const reloaded = await writer.periodTemplate.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('PeriodTemplate', id, expectedVersion);
    }
    return mapHeader(reloaded);
  }

  /**
   * Replace the entire period set for a template. Used by the update
   * endpoint when callers supply a new `periods[]`. Cascade-safe: deletes
   * the child rows first, then re-inserts.
   */
  public async replacePeriods(
    templateId: string,
    periods: readonly CreatePeriodInput[],
    tx?: PrismaTx,
  ): Promise<readonly PeriodTemplatePeriodRow[]> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.periodTemplatePeriod.deleteMany({
      where: { schoolId, periodTemplateId: templateId },
    });
    const out: PeriodTemplatePeriodRow[] = [];
    for (const p of periods) {
      const created = await writer.periodTemplatePeriod.create({
        data: {
          schoolId,
          periodTemplateId: templateId,
          index: p.index,
          label: p.label,
          type: p.type,
          startTime: timeStringToDate(p.startTime),
          endTime: timeStringToDate(p.endTime),
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
      });
      out.push(mapPeriod(created));
    }
    return out;
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.periodTemplate.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('PeriodTemplate', id, expectedVersion);
    }
  }

  /** Count of non-archived versions still using this template. */
  public async countActiveReferencingVersions(
    templateId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.timetableVersion.count({
      where: {
        schoolId,
        periodTemplateId: templateId,
        deletedAt: null,
        status: { not: 'ARCHIVED' },
      },
    });
  }

  /** Used by entry service to validate a periodIndex against the template. */
  public async findPeriodByIndex(
    templateId: string,
    index: number,
    tx?: PrismaTx,
  ): Promise<PeriodTemplatePeriodRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.periodTemplatePeriod.findFirst({
      where: { schoolId, periodTemplateId: templateId, index },
    });
    return row === null ? null : mapPeriod(row);
  }
}

interface RawHeader {
  id: string;
  schoolId: string;
  branchId: string;
  academicYearId: string;
  name: string;
  description: string | null;
  daysJson: unknown;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface RawPeriod {
  id: string;
  schoolId: string;
  periodTemplateId: string;
  index: number;
  label: string;
  type: PeriodTypeValue;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapHeader(row: RawHeader): PeriodTemplateRow {
  const days = Array.isArray(row.daysJson)
    ? (row.daysJson as number[]).filter((n) => Number.isInteger(n))
    : [];
  return {
    id: row.id,
    schoolId: row.schoolId,
    branchId: row.branchId,
    academicYearId: row.academicYearId,
    name: row.name,
    description: row.description,
    days,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function mapPeriod(row: RawPeriod): PeriodTemplatePeriodRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    periodTemplateId: row.periodTemplateId,
    index: row.index,
    label: row.label,
    type: row.type,
    startTime: dateToTimeString(row.startTime),
    endTime: dateToTimeString(row.endTime),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

/**
 * Convert `HH:MM[:SS]` 24-hour input into the stub Date that MySQL
 * `Time(0)` expects: year/month/day = 1970-01-01, only H:M:S semantic.
 */
function timeStringToDate(value: string): Date {
  const [h, m, s = '00'] = value.split(':');
  if (h === undefined || m === undefined) {
    throw new Error(`Invalid time string: "${value}"`);
  }
  return new Date(Date.UTC(1970, 0, 1, Number(h), Number(m), Number(s)));
}

function dateToTimeString(value: Date): string {
  const h = value.getUTCHours().toString().padStart(2, '0');
  const m = value.getUTCMinutes().toString().padStart(2, '0');
  const s = value.getUTCSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const __test__ = { timeStringToDate, dateToTimeString };
