/**
 * TimetableEntryService — class/section × day × period assignment.
 *
 * Write pipeline gates (plan §7.4):
 *   1. `module.timetable` feature flag.
 *   2. Version exists + status === DRAFT.
 *   3. Section/Subject/Staff/Room (if any) belong to the tenant.
 *   4. ConflictDetectorService.validate(...) — covers periods,
 *      double-booking, qualification, room type, working day,
 *      availability.
 *   5. Repo insert.
 *   6. TeacherLoadService.recompute(versionId, staffId, tx) — forward-
 *      declared via `TeacherLoadRecomputer` to keep injection acyclic.
 *
 * Bulk endpoint: per-row execution, each row in its own transaction;
 * partial failure collected into `{ created, failed, results[] }`.
 */
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  TIMETABLE_BULK_MAX_ENTRIES,
  TimetableFeatureFlags,
  TimetableOutboxTopics,
} from '../timetable.constants';
import {
  BulkLimitExceededError,
  CrossSchoolReferenceError,
  TimetableEntryNotFoundError,
  TimetableModuleDisabledError,
  TimetableVersionNotFoundError,
  VersionNotDraftError,
} from '../timetable.errors';
import type { TimetableEntryRow } from '../timetable.types';
import { TimetableVersionRepository } from '../version/version.repository';
import { TimetableConflictDetectorService } from './conflict-detector.service';
import {
  TimetableEntryRepository,
  type ListTimetableEntryArgs,
} from './entry.repository';
import { TeacherLoadRecomputer } from '../teacher-load/teacher-load.recomputer';

export interface CreateEntryArgs {
  readonly timetableVersionId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly staffId: string;
  readonly roomId?: string | null;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  readonly notes?: string | null;
}

export interface UpdateEntryArgs {
  readonly subjectId?: string;
  readonly staffId?: string;
  readonly roomId?: string | null;
  readonly dayOfWeek?: number;
  readonly periodIndex?: number;
  readonly notes?: string | null;
}

export interface BulkEntryArgs {
  readonly timetableVersionId: string;
  readonly entries: readonly Omit<CreateEntryArgs, 'timetableVersionId'>[];
}

export interface BulkEntryResultItem {
  readonly index: number;
  readonly sectionId: string;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  readonly id: string | null;
  readonly error: string | null;
}

export interface BulkEntryResult {
  readonly created: number;
  readonly failed: number;
  readonly results: readonly BulkEntryResultItem[];
}

@Injectable()
export class TimetableEntryService {
  private readonly logger = new Logger(TimetableEntryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TimetableEntryRepository,
    private readonly versionRepo: TimetableVersionRepository,
    private readonly detector: TimetableConflictDetectorService,
    @Inject(forwardRef(() => TeacherLoadRecomputer))
    private readonly loadRecomputer: TeacherLoadRecomputer,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListTimetableEntryArgs): Promise<{
    readonly items: readonly TimetableEntryRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<TimetableEntryRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new TimetableEntryNotFoundError(id);
    return row;
  }

  public async create(args: CreateEntryArgs): Promise<TimetableEntryRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      await this.assertVersionEditable(args.timetableVersionId, tx);
      await this.assertTenantRefs(args.sectionId, args.subjectId, args.staffId, args.roomId ?? null, tx);

      await this.detector.validate(
        {
          timetableVersionId: args.timetableVersionId,
          sectionId: args.sectionId,
          subjectId: args.subjectId,
          staffId: args.staffId,
          roomId: args.roomId ?? null,
          dayOfWeek: args.dayOfWeek,
          periodIndex: args.periodIndex,
        },
        tx,
      );

      const row = await this.repo.create(
        {
          timetableVersionId: args.timetableVersionId,
          sectionId: args.sectionId,
          subjectId: args.subjectId,
          staffId: args.staffId,
          roomId: args.roomId ?? null,
          dayOfWeek: args.dayOfWeek,
          periodIndex: args.periodIndex,
          notes: args.notes ?? null,
        },
        tx,
      );

      await this.loadRecomputer.recompute(args.timetableVersionId, args.staffId, tx);

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.ENTRY_CREATED,
        eventType: 'TimetableEntryCreated',
        aggregateType: 'TimetableEntry',
        aggregateId: row.id,
        payload: {
          id: row.id,
          versionId: row.timetableVersionId,
          sectionId: row.sectionId,
          staffId: row.staffId,
          dayOfWeek: row.dayOfWeek,
          periodIndex: row.periodIndex,
        },
      });
      await this.audit.record(
        {
          action: 'timetable_entry.create',
          category: 'general',
          resourceType: 'TimetableEntry',
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
    args: UpdateEntryArgs,
  ): Promise<TimetableEntryRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TimetableEntryNotFoundError(id);
      await this.assertVersionEditable(current.timetableVersionId, tx);

      const finalSubject = args.subjectId ?? current.subjectId;
      const finalStaff = args.staffId ?? current.staffId;
      const finalRoom = args.roomId === undefined ? current.roomId : args.roomId;
      const finalDow = args.dayOfWeek ?? current.dayOfWeek;
      const finalPeriod = args.periodIndex ?? current.periodIndex;
      await this.assertTenantRefs(current.sectionId, finalSubject, finalStaff, finalRoom, tx);

      await this.detector.validate(
        {
          timetableVersionId: current.timetableVersionId,
          sectionId: current.sectionId,
          subjectId: finalSubject,
          staffId: finalStaff,
          roomId: finalRoom,
          dayOfWeek: finalDow,
          periodIndex: finalPeriod,
          excludeEntryId: id,
        },
        tx,
      );

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      // Recompute load for both old + new teacher if it changed.
      await this.loadRecomputer.recompute(current.timetableVersionId, current.staffId, tx);
      if (current.staffId !== finalStaff) {
        await this.loadRecomputer.recompute(current.timetableVersionId, finalStaff, tx);
      }

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.ENTRY_UPDATED,
        eventType: 'TimetableEntryUpdated',
        aggregateType: 'TimetableEntry',
        aggregateId: id,
        payload: { id, versionId: current.timetableVersionId },
      });
      await this.audit.record(
        {
          action: 'timetable_entry.update',
          category: 'general',
          resourceType: 'TimetableEntry',
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
      if (current === null) throw new TimetableEntryNotFoundError(id);
      await this.assertVersionEditable(current.timetableVersionId, tx);
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.loadRecomputer.recompute(current.timetableVersionId, current.staffId, tx);
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.ENTRY_DELETED,
        eventType: 'TimetableEntryDeleted',
        aggregateType: 'TimetableEntry',
        aggregateId: id,
        payload: { id, versionId: current.timetableVersionId },
      });
      await this.audit.record(
        {
          action: 'timetable_entry.delete',
          category: 'general',
          resourceType: 'TimetableEntry',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  public async bulkCreate(args: BulkEntryArgs): Promise<BulkEntryResult> {
    await this.assertModuleEnabled();
    if (args.entries.length > TIMETABLE_BULK_MAX_ENTRIES) {
      throw new BulkLimitExceededError(TIMETABLE_BULK_MAX_ENTRIES, args.entries.length);
    }

    const results: BulkEntryResultItem[] = [];
    let created = 0;
    let failed = 0;
    const touchedStaff = new Set<string>();

    for (let i = 0; i < args.entries.length; i += 1) {
      const entry = args.entries[i];
      if (entry === undefined) continue;
      try {
        const row = await this.prisma.transaction(async (tx) => {
          await this.assertVersionEditable(args.timetableVersionId, tx);
          await this.assertTenantRefs(
            entry.sectionId,
            entry.subjectId,
            entry.staffId,
            entry.roomId ?? null,
            tx,
          );
          await this.detector.validate(
            {
              timetableVersionId: args.timetableVersionId,
              sectionId: entry.sectionId,
              subjectId: entry.subjectId,
              staffId: entry.staffId,
              roomId: entry.roomId ?? null,
              dayOfWeek: entry.dayOfWeek,
              periodIndex: entry.periodIndex,
            },
            tx,
          );
          const inserted = await this.repo.create(
            {
              timetableVersionId: args.timetableVersionId,
              sectionId: entry.sectionId,
              subjectId: entry.subjectId,
              staffId: entry.staffId,
              roomId: entry.roomId ?? null,
              dayOfWeek: entry.dayOfWeek,
              periodIndex: entry.periodIndex,
              notes: entry.notes ?? null,
            },
            tx,
          );
          await this.audit.record(
            {
              action: 'timetable_entry.create',
              category: 'general',
              resourceType: 'TimetableEntry',
              resourceId: inserted.id,
              after: inserted,
            },
            { tx: tx as unknown as AuditTxLike },
          );
          return inserted;
        });
        created += 1;
        touchedStaff.add(row.staffId);
        results.push({
          index: i,
          sectionId: entry.sectionId,
          dayOfWeek: entry.dayOfWeek,
          periodIndex: entry.periodIndex,
          id: row.id,
          error: null,
        });
      } catch (err) {
        failed += 1;
        results.push({
          index: i,
          sectionId: entry.sectionId,
          dayOfWeek: entry.dayOfWeek,
          periodIndex: entry.periodIndex,
          id: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (created > 0) {
      await this.prisma.transaction(async (tx) => {
        for (const staffId of touchedStaff) {
          await this.loadRecomputer.recompute(args.timetableVersionId, staffId, tx);
        }
        await this.outbox.publish(tx, {
          topic: TimetableOutboxTopics.ENTRY_BULK_CREATED,
          eventType: 'TimetableEntriesBulkCreated',
          aggregateType: 'TimetableVersion',
          aggregateId: args.timetableVersionId,
          payload: {
            versionId: args.timetableVersionId,
            createdCount: created,
            failedCount: failed,
          },
        });
      });
    }

    this.logger.log(
      `TimetableEntry bulk insert versionId=${args.timetableVersionId} created=${created} failed=${failed}.`,
    );
    return { created, failed, results };
  }

  private async assertVersionEditable(versionId: string, tx: PrismaTx): Promise<void> {
    const version = await this.versionRepo.findById(versionId, tx);
    if (version === null) throw new TimetableVersionNotFoundError(versionId);
    if (version.status !== 'DRAFT') {
      throw new VersionNotDraftError(versionId, version.status);
    }
  }

  private async assertTenantRefs(
    sectionId: string,
    subjectId: string,
    staffId: string,
    roomId: string | null,
    tx: PrismaTx,
  ): Promise<void> {
    const schoolId = this.requireSchoolId();
    const [section, subject, staff, room] = await Promise.all([
      tx.section.findUnique({ where: { schoolId_id: { schoolId, id: sectionId } } }),
      tx.subject.findUnique({ where: { schoolId_id: { schoolId, id: subjectId } } }),
      tx.staff.findUnique({ where: { schoolId_id: { schoolId, id: staffId } } }),
      roomId === null
        ? Promise.resolve(null)
        : tx.room.findUnique({ where: { schoolId_id: { schoolId, id: roomId } } }),
    ]);
    if (section === null) throw new CrossSchoolReferenceError('Section', sectionId);
    if (subject === null) throw new CrossSchoolReferenceError('Subject', subjectId);
    if (staff === null) throw new CrossSchoolReferenceError('Staff', staffId);
    if (roomId !== null && room === null) {
      throw new CrossSchoolReferenceError('Room', roomId);
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TimetableEntryService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(TimetableFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new TimetableModuleDisabledError();
  }
}
