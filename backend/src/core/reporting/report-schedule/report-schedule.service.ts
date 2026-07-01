/**
 * ReportScheduleService — CRUD orchestration for ReportSchedule.
 *
 * Constants only expose SCHEDULE_CREATED / SCHEDULE_TOGGLED / SCHEDULE_DELETED
 * topics. SCHEDULE_TOGGLED is reused for general updates (toggle + update both
 * fire it) so downstream consumers can observe any mutation.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as cronParser from 'cron-parser';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES, SequenceService } from '../../sequences';
import {
  ReportingFeatureFlags,
  ReportingOutboxTopics,
  type ReportFormatValue,
  type ReportKindValue,
  type ReportScheduleFrequencyValue,
} from '../reporting.constants';
import {
  ReportScheduleCronInvalidError,
  ReportScheduleNotFoundError,
  ReportingModuleDisabledError,
} from '../reporting.errors';
import type { ReportScheduleRow, ScheduleRecipient } from '../reporting.types';
import {
  ReportScheduleRepository,
  type ListReportSchedulesArgs,
} from './report-schedule.repository';

export interface CreateReportScheduleArgs {
  readonly name: string;
  readonly reportKind: ReportKindValue;
  readonly format: ReportFormatValue;
  readonly frequency: ReportScheduleFrequencyValue;
  readonly cron: string;
  readonly params: Record<string, unknown>;
  readonly recipients: readonly ScheduleRecipient[];
}

export interface UpdateReportScheduleArgs {
  readonly name?: string;
  readonly reportKind?: ReportKindValue;
  readonly format?: ReportFormatValue;
  readonly frequency?: ReportScheduleFrequencyValue;
  readonly cron?: string;
  readonly params?: Record<string, unknown>;
  readonly recipients?: readonly ScheduleRecipient[];
}

@Injectable()
export class ReportScheduleService {
  private readonly logger = new Logger(ReportScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ReportScheduleRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListReportSchedulesArgs): Promise<{
    readonly items: readonly ReportScheduleRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ReportScheduleRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new ReportScheduleNotFoundError(id);
    return row;
  }

  public async create(
    args: CreateReportScheduleArgs,
  ): Promise<ReportScheduleRow> {
    await this.assertModuleEnabled();
    const nextRunAt = this.computeNextRunAt(args.cron);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const code = await this.allocateCode(tx);
      const created = await this.repo.create(
        {
          code,
          name: args.name,
          reportKind: args.reportKind,
          format: args.format,
          frequency: args.frequency,
          cron: args.cron,
          params: args.params,
          recipients: args.recipients,
          ownedByUserId: userId,
          nextRunAt,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.SCHEDULE_CREATED,
        eventType: 'ReportScheduleCreated',
        aggregateType: 'ReportSchedule',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          name: created.name,
          reportKind: created.reportKind,
          frequency: created.frequency,
          nextRunAt: created.nextRunAt?.toISOString() ?? null,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-schedule.create',
          category: 'general',
          resourceType: 'ReportSchedule',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Report schedule created id=${created.id} code="${created.code}" cron="${created.cron}".`,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateReportScheduleArgs,
  ): Promise<ReportScheduleRow> {
    await this.assertModuleEnabled();

    let nextRunAt: Date | null | undefined;
    if (patch.cron !== undefined) {
      nextRunAt = this.computeNextRunAt(patch.cron);
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportScheduleNotFoundError(id);

      const updated = await this.repo.update(
        id,
        expectedVersion,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.reportKind !== undefined
            ? { reportKind: patch.reportKind }
            : {}),
          ...(patch.format !== undefined ? { format: patch.format } : {}),
          ...(patch.frequency !== undefined
            ? { frequency: patch.frequency }
            : {}),
          ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
          ...(patch.params !== undefined ? { params: patch.params } : {}),
          ...(patch.recipients !== undefined
            ? { recipients: patch.recipients }
            : {}),
          ...(nextRunAt !== undefined ? { nextRunAt } : {}),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.SCHEDULE_TOGGLED,
        eventType: 'ReportScheduleUpdated',
        aggregateType: 'ReportSchedule',
        aggregateId: id,
        payload: { id, code: updated.code, isEnabled: updated.isEnabled },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-schedule.update',
          category: 'general',
          resourceType: 'ReportSchedule',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async enable(
    id: string,
    expectedVersion: number,
  ): Promise<ReportScheduleRow> {
    return this.toggle(id, expectedVersion, true);
  }

  public async disable(
    id: string,
    expectedVersion: number,
  ): Promise<ReportScheduleRow> {
    return this.toggle(id, expectedVersion, false);
  }

  private async toggle(
    id: string,
    expectedVersion: number,
    isEnabled: boolean,
  ): Promise<ReportScheduleRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportScheduleNotFoundError(id);

      const updated = await this.repo.patchToggle(
        id,
        expectedVersion,
        isEnabled,
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.SCHEDULE_TOGGLED,
        eventType: isEnabled
          ? 'ReportScheduleEnabled'
          : 'ReportScheduleDisabled',
        aggregateType: 'ReportSchedule',
        aggregateId: id,
        payload: { id, code: updated.code, isEnabled },
        schoolId,
      });

      await this.audit.record(
        {
          action: isEnabled ? 'report-schedule.enable' : 'report-schedule.disable',
          category: 'general',
          resourceType: 'ReportSchedule',
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
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportScheduleNotFoundError(id);

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.SCHEDULE_DELETED,
        eventType: 'ReportScheduleDeleted',
        aggregateType: 'ReportSchedule',
        aggregateId: id,
        payload: { id, code: current.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-schedule.delete',
          category: 'general',
          resourceType: 'ReportSchedule',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private computeNextRunAt(cron: string): Date | null {
    try {
      const interval = cronParser.parseExpression(cron);
      return interval.next().toDate();
    } catch (err) {
      throw new ReportScheduleCronInvalidError(cron, (err as Error).message);
    }
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.REPORT_SCHEDULE, { tx });
    return `SCHED-${seq.toString().padStart(6, '0')}`;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportScheduleService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private requireUserId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('ReportScheduleService requires an authenticated user.');
    }
    return ctx.userId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ReportingFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ReportingModuleDisabledError();
  }
}
