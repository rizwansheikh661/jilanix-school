/**
 * PeriodTemplateService — orchestration for period-template CRUD.
 *
 * Validation gates (per Sprint 7 plan §7.2):
 *   1. `module.timetable` feature flag.
 *   2. `days[]` non-empty subset of `[1..7]`, no duplicates.
 *   3. Period `index` values form a contiguous `1..N` set.
 *   4. Period `startTime < endTime`.
 *   5. No two periods within a template overlap in time.
 *   6. Duplicate-name guard via repo `findActiveByName` (DB also enforces).
 *   7. Delete refused while any non-ARCHIVED `TimetableVersion`
 *      references the template.
 *
 * Every mutation publishes a `timetable.period_template.*` outbox event
 * and writes a `general` audit row inside the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  ISO_DAYS_OF_WEEK,
  PERIOD_TEMPLATE_MAX_PERIODS,
  TimetableFeatureFlags,
  TimetableOutboxTopics,
  type PeriodTypeValue,
} from '../timetable.constants';
import {
  DuplicatePeriodTemplateError,
  PeriodIndicesInvalidError,
  PeriodTemplateDaysInvalidError,
  PeriodTemplateInUseError,
  PeriodTemplateNotFoundError,
  PeriodTimeOrderError,
  PeriodTimesOverlapError,
  TimetableModuleDisabledError,
} from '../timetable.errors';
import type { PeriodTemplateRow, PeriodTemplateWithPeriods } from '../timetable.types';
import {
  PeriodTemplateRepository,
  type CreatePeriodInput,
  type ListPeriodTemplateArgs,
} from './period-template.repository';

export interface CreatePeriodTemplateArgs {
  readonly branchId: string;
  readonly academicYearId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly days: readonly number[];
  readonly isDefault?: boolean;
  readonly periods: readonly PeriodInputArgs[];
}

export interface PeriodInputArgs {
  readonly index: number;
  readonly label: string;
  readonly type: PeriodTypeValue;
  readonly startTime: string;
  readonly endTime: string;
}

export interface UpdatePeriodTemplateArgs {
  readonly name?: string;
  readonly description?: string | null;
  readonly days?: readonly number[];
  readonly isDefault?: boolean;
  /**
   * Optional — when supplied, the full period set is replaced. Validated
   * with the same rules as create.
   */
  readonly periods?: readonly PeriodInputArgs[];
}

@Injectable()
export class PeriodTemplateService {
  private readonly logger = new Logger(PeriodTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PeriodTemplateRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListPeriodTemplateArgs): Promise<{
    readonly items: readonly PeriodTemplateWithPeriods[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<PeriodTemplateWithPeriods> {
    const row = await this.repo.findById(id);
    if (row === null) throw new PeriodTemplateNotFoundError(id);
    return row;
  }

  public async create(args: CreatePeriodTemplateArgs): Promise<PeriodTemplateWithPeriods> {
    await this.assertModuleEnabled();
    this.validateDays(args.days);
    this.validatePeriods(args.periods);

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByName(
        args.branchId,
        args.academicYearId,
        args.name,
        tx,
      );
      if (dup !== null) throw new DuplicatePeriodTemplateError(args.name);

      const row = await this.repo.create(
        {
          branchId: args.branchId,
          academicYearId: args.academicYearId,
          name: args.name,
          description: args.description ?? null,
          days: args.days,
          isDefault: args.isDefault ?? false,
          periods: args.periods.map(toRepoPeriod),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.PERIOD_TEMPLATE_CREATED,
        eventType: 'PeriodTemplateCreated',
        aggregateType: 'PeriodTemplate',
        aggregateId: row.id,
        payload: {
          id: row.id,
          branchId: row.branchId,
          academicYearId: row.academicYearId,
          name: row.name,
          days: row.days,
          periodCount: row.periods.length,
        },
      });

      await this.audit.record(
        {
          action: 'period_template.create',
          category: 'general',
          resourceType: 'PeriodTemplate',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `PeriodTemplate created id=${row.id} branchId=${row.branchId} name="${row.name}" periods=${row.periods.length}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdatePeriodTemplateArgs,
  ): Promise<PeriodTemplateWithPeriods> {
    await this.assertModuleEnabled();
    if (args.days !== undefined) this.validateDays(args.days);
    if (args.periods !== undefined) this.validatePeriods(args.periods);

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PeriodTemplateNotFoundError(id);

      if (args.name !== undefined && args.name !== current.name) {
        const dup = await this.repo.findActiveByName(
          current.branchId,
          current.academicYearId,
          args.name,
          tx,
        );
        if (dup !== null && dup.id !== id) {
          throw new DuplicatePeriodTemplateError(args.name);
        }
      }

      const headerPatch: Record<string, unknown> = {};
      if (args.name !== undefined) headerPatch.name = args.name;
      if (args.description !== undefined) headerPatch.description = args.description;
      if (args.days !== undefined) headerPatch.days = args.days;
      if (args.isDefault !== undefined) headerPatch.isDefault = args.isDefault;
      await this.repo.update(id, expectedVersion, headerPatch, tx);

      if (args.periods !== undefined) {
        await this.repo.replacePeriods(id, args.periods.map(toRepoPeriod), tx);
      }

      const updated = await this.repo.findById(id, tx);
      if (updated === null) throw new PeriodTemplateNotFoundError(id);

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.PERIOD_TEMPLATE_UPDATED,
        eventType: 'PeriodTemplateUpdated',
        aggregateType: 'PeriodTemplate',
        aggregateId: id,
        payload: {
          id,
          branchId: updated.branchId,
          academicYearId: updated.academicYearId,
          name: updated.name,
          periodCount: updated.periods.length,
        },
      });

      await this.audit.record(
        {
          action: 'period_template.update',
          category: 'general',
          resourceType: 'PeriodTemplate',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PeriodTemplateNotFoundError(id);
      const refCount = await this.repo.countActiveReferencingVersions(id, tx);
      if (refCount > 0) {
        throw new PeriodTemplateInUseError(id, 'active-version-reference');
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.PERIOD_TEMPLATE_DELETED,
        eventType: 'PeriodTemplateDeleted',
        aggregateType: 'PeriodTemplate',
        aggregateId: id,
        payload: {
          id,
          branchId: current.branchId,
          academicYearId: current.academicYearId,
          name: current.name,
        },
      });
      await this.audit.record(
        {
          action: 'period_template.delete',
          category: 'general',
          resourceType: 'PeriodTemplate',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`PeriodTemplate soft-deleted id=${id}.`);
    });
  }

  // ---------------------------------------------------------------------
  // Internal validators
  // ---------------------------------------------------------------------

  private validateDays(days: readonly number[]): void {
    if (days.length === 0) {
      throw new PeriodTemplateDaysInvalidError('days[] must not be empty');
    }
    const allowed = new Set<number>(ISO_DAYS_OF_WEEK);
    const seen = new Set<number>();
    for (const d of days) {
      if (!allowed.has(d)) {
        throw new PeriodTemplateDaysInvalidError(
          `day ${d} is not in [1..7]`,
        );
      }
      if (seen.has(d)) {
        throw new PeriodTemplateDaysInvalidError(`duplicate day ${d}`);
      }
      seen.add(d);
    }
  }

  private validatePeriods(periods: readonly PeriodInputArgs[]): void {
    if (periods.length === 0) {
      throw new PeriodIndicesInvalidError('at least one period required');
    }
    if (periods.length > PERIOD_TEMPLATE_MAX_PERIODS) {
      throw new PeriodIndicesInvalidError(
        `period count ${periods.length} exceeds max ${PERIOD_TEMPLATE_MAX_PERIODS}`,
      );
    }

    const sorted = [...periods].sort((a, b) => a.index - b.index);
    const seen = new Set<number>();
    for (let i = 0; i < sorted.length; i += 1) {
      const cur = sorted[i];
      if (cur === undefined) continue;
      if (seen.has(cur.index)) {
        throw new PeriodIndicesInvalidError(`duplicate index ${cur.index}`);
      }
      seen.add(cur.index);
      if (cur.index !== i + 1) {
        throw new PeriodIndicesInvalidError(
          `expected contiguous indices 1..N; got ${cur.index} at position ${i + 1}`,
        );
      }
      const startMin = parseTimeToMinutes(cur.startTime);
      const endMin = parseTimeToMinutes(cur.endTime);
      if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
        throw new PeriodIndicesInvalidError(
          `period ${cur.index}: invalid time format`,
        );
      }
      if (!(startMin < endMin)) {
        throw new PeriodTimeOrderError(cur.index);
      }
    }

    // Pairwise overlap check on time-sorted array.
    const byStart = [...sorted].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
    );
    for (let i = 1; i < byStart.length; i += 1) {
      const prev = byStart[i - 1];
      const cur = byStart[i];
      if (prev === undefined || cur === undefined) continue;
      const prevEnd = parseTimeToMinutes(prev.endTime);
      const curStart = parseTimeToMinutes(cur.startTime);
      if (curStart < prevEnd) {
        throw new PeriodTimesOverlapError(prev.index, cur.index);
      }
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(TimetableFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new TimetableModuleDisabledError();
  }
}

function toRepoPeriod(p: PeriodInputArgs): CreatePeriodInput {
  return {
    index: p.index,
    label: p.label,
    type: p.type,
    startTime: normalizeTime(p.startTime),
    endTime: normalizeTime(p.endTime),
  };
}

function parseTimeToMinutes(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (m === null) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] !== undefined ? Number(m[3]) : 0;
  return h * 3600 + min * 60 + s;
}

function normalizeTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
}

// Exported via `_test_` for the service spec.
export const __test__ = { parseTimeToMinutes, normalizeTime };

// Re-export the row shapes for the controller's response mapper.
export type { PeriodTemplateRow };
