/**
 * TeacherAvailabilityService — CRUD + the `isAvailable()` query that the
 * entry write pipeline uses to enforce the TEACHER_UNAVAILABLE gate.
 *
 * Rule (plan §7.4.4 step 11): a teacher is UNAVAILABLE for a slot when
 *   - any active row with `kind=UNAVAILABLE` covers the slot (day +
 *     either matching periodIndex or periodIndex=null = whole day),
 *     within `[effectiveFrom, effectiveTo]` containing `onDate`.
 * Explicit AVAILABLE rows are tolerated but never override an
 * UNAVAILABLE row for the same slot — UNAVAILABLE wins.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import {
  ISO_DAYS_OF_WEEK,
  TimetableFeatureFlags,
  TimetableOutboxTopics,
  type TeacherAvailabilityKindValue,
} from '../timetable.constants';
import {
  AvailabilityWindowInvalidError,
  TeacherAvailabilityNotFoundError,
  TimetableModuleDisabledError,
} from '../timetable.errors';
import type { TeacherAvailabilityRow } from '../timetable.types';
import {
  TeacherAvailabilityRepository,
  type ListTeacherAvailabilityArgs,
} from './availability.repository';

export interface CreateAvailabilityArgs {
  readonly staffId: string;
  readonly academicYearId: string;
  readonly kind: TeacherAvailabilityKindValue;
  readonly dayOfWeek: number;
  readonly periodIndex?: number | null;
  readonly reason?: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
}

export interface UpdateAvailabilityArgs {
  readonly kind?: TeacherAvailabilityKindValue;
  readonly dayOfWeek?: number;
  readonly periodIndex?: number | null;
  readonly reason?: string | null;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
}

@Injectable()
export class TeacherAvailabilityService {
  private readonly logger = new Logger(TeacherAvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TeacherAvailabilityRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListTeacherAvailabilityArgs): Promise<{
    readonly items: readonly TeacherAvailabilityRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<TeacherAvailabilityRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new TeacherAvailabilityNotFoundError(id);
    return row;
  }

  public async create(args: CreateAvailabilityArgs): Promise<TeacherAvailabilityRow> {
    await this.assertModuleEnabled();
    this.validate(args.dayOfWeek, args.effectiveFrom, args.effectiveTo ?? null);

    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(
        {
          staffId: args.staffId,
          academicYearId: args.academicYearId,
          kind: args.kind,
          dayOfWeek: args.dayOfWeek,
          periodIndex: args.periodIndex ?? null,
          reason: args.reason ?? null,
          effectiveFrom: args.effectiveFrom,
          effectiveTo: args.effectiveTo ?? null,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.AVAILABILITY_CHANGED,
        eventType: 'TeacherAvailabilityCreated',
        aggregateType: 'TeacherAvailability',
        aggregateId: row.id,
        payload: {
          id: row.id,
          staffId: row.staffId,
          kind: row.kind,
          dayOfWeek: row.dayOfWeek,
          periodIndex: row.periodIndex,
        },
      });
      await this.audit.record(
        {
          action: 'teacher_availability.create',
          category: 'general',
          resourceType: 'TeacherAvailability',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateAvailabilityArgs,
  ): Promise<TeacherAvailabilityRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TeacherAvailabilityNotFoundError(id);

      const finalDow = args.dayOfWeek ?? current.dayOfWeek;
      const finalFrom = args.effectiveFrom ?? current.effectiveFrom;
      const finalTo =
        args.effectiveTo === undefined ? current.effectiveTo : args.effectiveTo;
      this.validate(finalDow, finalFrom, finalTo);

      const patch: Record<string, unknown> = {};
      if (args.kind !== undefined) patch.kind = args.kind;
      if (args.dayOfWeek !== undefined) patch.dayOfWeek = args.dayOfWeek;
      if (args.periodIndex !== undefined) patch.periodIndex = args.periodIndex;
      if (args.reason !== undefined) patch.reason = args.reason;
      if (args.effectiveFrom !== undefined) patch.effectiveFrom = args.effectiveFrom;
      if (args.effectiveTo !== undefined) patch.effectiveTo = args.effectiveTo;
      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.AVAILABILITY_CHANGED,
        eventType: 'TeacherAvailabilityUpdated',
        aggregateType: 'TeacherAvailability',
        aggregateId: id,
        payload: { id, staffId: updated.staffId },
      });
      await this.audit.record(
        {
          action: 'teacher_availability.update',
          category: 'general',
          resourceType: 'TeacherAvailability',
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
      if (current === null) throw new TeacherAvailabilityNotFoundError(id);
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.AVAILABILITY_CHANGED,
        eventType: 'TeacherAvailabilityDeleted',
        aggregateType: 'TeacherAvailability',
        aggregateId: id,
        payload: { id, staffId: current.staffId },
      });
      await this.audit.record(
        {
          action: 'teacher_availability.delete',
          category: 'general',
          resourceType: 'TeacherAvailability',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`TeacherAvailability soft-deleted id=${id}.`);
    });
  }

  /**
   * Returns false if any active UNAVAILABLE row covers the slot on the
   * given date. Used by the entry write pipeline.
   */
  public async isAvailable(
    args: {
      staffId: string;
      academicYearId: string;
      dayOfWeek: number;
      periodIndex: number;
      onDate: Date;
    },
    tx?: PrismaTx,
  ): Promise<boolean> {
    const rows = await this.repo.findActiveForStaffSlot(
      args.staffId,
      args.academicYearId,
      args.dayOfWeek,
      args.periodIndex,
      args.onDate,
      tx,
    );
    return !rows.some((r) => r.kind === 'UNAVAILABLE');
  }

  private validate(dow: number, from: Date, to: Date | null): void {
    if (!ISO_DAYS_OF_WEEK.includes(dow as (typeof ISO_DAYS_OF_WEEK)[number])) {
      throw new AvailabilityWindowInvalidError(`dayOfWeek ${dow} not in [1..7]`);
    }
    if (to !== null && from.getTime() > to.getTime()) {
      throw new AvailabilityWindowInvalidError('effectiveFrom must be on or before effectiveTo');
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
