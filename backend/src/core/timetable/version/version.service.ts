/**
 * TimetableVersionService — DRAFT/ACTIVE/ARCHIVED state machine.
 *
 * Transitions:
 *   create()    → DRAFT
 *   activate()  → DRAFT → ACTIVE; any prior ACTIVE flips to ARCHIVED in
 *                 the same transaction.
 *   archive()   → ACTIVE → ARCHIVED.
 *   softDelete()→ DRAFT/ARCHIVED only; ACTIVE refused.
 *
 * Date-range invariants:
 *   - `effectiveFrom <= effectiveTo` when both supplied.
 *
 * The "only one ACTIVE per (school, branch, year)" rule is enforced by
 * the DB STORED `status_active_key` + `uq_tt_ver_active_per_year` unique
 * index AND the service layer (which archives the prior ACTIVE first to
 * keep the row count at most one and avoid the unique-violation error
 * leaking to clients).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  TimetableFeatureFlags,
  TimetableOutboxTopics,
} from '../timetable.constants';
import {
  ActiveVersionExistsError,
  PeriodTemplateNotFoundError,
  TimetableModuleDisabledError,
  TimetableVersionNotFoundError,
  VersionActiveCannotDeleteError,
  VersionDateRangeError,
  VersionStatusTransitionError,
} from '../timetable.errors';
import type { TimetableVersionRow } from '../timetable.types';
import { PeriodTemplateRepository } from '../period-template/period-template.repository';
import {
  TimetableVersionRepository,
  type ListTimetableVersionArgs,
} from './version.repository';

export interface CreateVersionArgs {
  readonly branchId: string;
  readonly academicYearId: string;
  readonly periodTemplateId: string;
  readonly name: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
}

export interface UpdateVersionArgs {
  readonly name?: string;
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
}

@Injectable()
export class TimetableVersionService {
  private readonly logger = new Logger(TimetableVersionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TimetableVersionRepository,
    private readonly templateRepo: PeriodTemplateRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListTimetableVersionArgs): Promise<{
    readonly items: readonly TimetableVersionRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<TimetableVersionRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new TimetableVersionNotFoundError(id);
    return row;
  }

  public async create(args: CreateVersionArgs): Promise<TimetableVersionRow> {
    await this.assertModuleEnabled();
    this.assertDateRange(args.effectiveFrom, args.effectiveTo ?? null);

    return this.prisma.transaction(async (tx) => {
      const template = await this.templateRepo.findById(args.periodTemplateId, tx);
      if (template === null) {
        throw new PeriodTemplateNotFoundError(args.periodTemplateId);
      }
      if (template.branchId !== args.branchId || template.academicYearId !== args.academicYearId) {
        throw new VersionDateRangeError(
          'periodTemplate branch/year does not match version branch/year',
        );
      }

      const row = await this.repo.create(
        {
          branchId: args.branchId,
          academicYearId: args.academicYearId,
          periodTemplateId: args.periodTemplateId,
          name: args.name,
          effectiveFrom: args.effectiveFrom,
          effectiveTo: args.effectiveTo ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.VERSION_CREATED,
        eventType: 'TimetableVersionCreated',
        aggregateType: 'TimetableVersion',
        aggregateId: row.id,
        payload: {
          id: row.id,
          branchId: row.branchId,
          academicYearId: row.academicYearId,
          periodTemplateId: row.periodTemplateId,
          name: row.name,
          status: row.status,
        },
      });

      await this.audit.record(
        {
          action: 'timetable_version.create',
          category: 'general',
          resourceType: 'TimetableVersion',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `TimetableVersion created id=${row.id} branch=${row.branchId} year=${row.academicYearId} name="${row.name}".`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateVersionArgs,
  ): Promise<TimetableVersionRow> {
    await this.assertModuleEnabled();
    if (args.effectiveFrom !== undefined || args.effectiveTo !== undefined) {
      // Resolve final values from current + patch.
    }

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TimetableVersionNotFoundError(id);

      const finalFrom = args.effectiveFrom ?? current.effectiveFrom;
      const finalTo = args.effectiveTo === undefined ? current.effectiveTo : args.effectiveTo;
      this.assertDateRange(finalFrom, finalTo);

      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.effectiveFrom !== undefined) patch.effectiveFrom = args.effectiveFrom;
      if (args.effectiveTo !== undefined) patch.effectiveTo = args.effectiveTo;
      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.VERSION_UPDATED,
        eventType: 'TimetableVersionUpdated',
        aggregateType: 'TimetableVersion',
        aggregateId: id,
        payload: { id, name: updated.name },
      });

      await this.audit.record(
        {
          action: 'timetable_version.update',
          category: 'general',
          resourceType: 'TimetableVersion',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  public async activate(id: string, expectedVersion: number): Promise<TimetableVersionRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TimetableVersionNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new VersionStatusTransitionError(current.status, 'ACTIVE');
      }
      const now = new Date();

      const priorActive = await this.repo.findActive(current.branchId, current.academicYearId, tx);
      if (priorActive !== null) {
        await this.repo.setStatus(
          priorActive.id,
          priorActive.version,
          'ARCHIVED',
          { archivedAt: now },
          tx,
        );
        await this.outbox.publish(tx, {
          topic: TimetableOutboxTopics.VERSION_ARCHIVED,
          eventType: 'TimetableVersionArchived',
          aggregateType: 'TimetableVersion',
          aggregateId: priorActive.id,
          payload: {
            id: priorActive.id,
            reason: 'superseded',
            supersededBy: id,
          },
        });
      }

      let activated: TimetableVersionRow;
      try {
        activated = await this.repo.setStatus(
          id,
          expectedVersion,
          'ACTIVE',
          { activatedAt: now },
          tx,
        );
      } catch (err) {
        // STORED unique violation surfaces here if a race left two ACTIVE
        // rows; rethrow as the domain error.
        if (err instanceof Error && /uq_tt_ver_active_per_year/i.test(err.message)) {
          throw new ActiveVersionExistsError(priorActive?.id ?? 'unknown');
        }
        throw err;
      }

      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.VERSION_ACTIVATED,
        eventType: 'TimetableVersionActivated',
        aggregateType: 'TimetableVersion',
        aggregateId: id,
        payload: {
          id,
          branchId: activated.branchId,
          academicYearId: activated.academicYearId,
        },
      });

      await this.audit.record(
        {
          action: 'timetable_version.activate',
          category: 'general',
          resourceType: 'TimetableVersion',
          resourceId: id,
          before: current,
          after: activated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`TimetableVersion activated id=${id}.`);
      return activated;
    });
  }

  public async archive(id: string, expectedVersion: number): Promise<TimetableVersionRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TimetableVersionNotFoundError(id);
      if (current.status !== 'ACTIVE') {
        throw new VersionStatusTransitionError(current.status, 'ARCHIVED');
      }
      const now = new Date();
      const archived = await this.repo.setStatus(
        id,
        expectedVersion,
        'ARCHIVED',
        { archivedAt: now },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.VERSION_ARCHIVED,
        eventType: 'TimetableVersionArchived',
        aggregateType: 'TimetableVersion',
        aggregateId: id,
        payload: { id, reason: 'manual' },
      });
      await this.audit.record(
        {
          action: 'timetable_version.archive',
          category: 'general',
          resourceType: 'TimetableVersion',
          resourceId: id,
          before: current,
          after: archived,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return archived;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new TimetableVersionNotFoundError(id);
      if (current.status === 'ACTIVE') {
        throw new VersionActiveCannotDeleteError(id);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: TimetableOutboxTopics.VERSION_DELETED,
        eventType: 'TimetableVersionDeleted',
        aggregateType: 'TimetableVersion',
        aggregateId: id,
        payload: { id },
      });
      await this.audit.record(
        {
          action: 'timetable_version.delete',
          category: 'general',
          resourceType: 'TimetableVersion',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private assertDateRange(from: Date, to: Date | null): void {
    if (to !== null && from.getTime() > to.getTime()) {
      throw new VersionDateRangeError('effectiveFrom must be on or before effectiveTo');
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
