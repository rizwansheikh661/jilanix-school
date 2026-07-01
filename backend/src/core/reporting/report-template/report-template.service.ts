/**
 * ReportTemplateService — CRUD orchestration for ReportTemplate.
 *
 * Visibility rule: list defaults to (own ∪ shared); pass mineOnly=true to
 * restrict to caller-owned rows. getById hides non-shared rows owned by
 * another user behind ReportTemplateNotFoundError (no existence leak).
 * Updates and deletes require ownership (ReportTemplateNotOwnedError).
 */
import { Injectable, Logger } from '@nestjs/common';

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
  type ReportKindValue,
} from '../reporting.constants';
import {
  ReportTemplateNotFoundError,
  ReportTemplateNotOwnedError,
  ReportingModuleDisabledError,
} from '../reporting.errors';
import type { ReportTemplateRow } from '../reporting.types';
import {
  ReportTemplateRepository,
  type ListReportTemplatesArgs,
} from './report-template.repository';

export interface CreateReportTemplateArgs {
  readonly name: string;
  readonly description?: string;
  readonly reportKind: ReportKindValue;
  readonly params: Record<string, unknown>;
  readonly isShared?: boolean;
}

export interface UpdateReportTemplateArgs {
  readonly name?: string;
  readonly description?: string;
  readonly reportKind?: ReportKindValue;
  readonly params?: Record<string, unknown>;
  readonly isShared?: boolean;
}

export interface ListReportTemplatesServiceArgs extends ListReportTemplatesArgs {
  readonly mineOnly?: boolean;
}

@Injectable()
export class ReportTemplateService {
  private readonly logger = new Logger(ReportTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ReportTemplateRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListReportTemplatesServiceArgs): Promise<{
    readonly items: readonly ReportTemplateRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const userId = this.requireUserId();
    const { mineOnly, ...rest } = args;
    const { rows, nextCursorId } = mineOnly === true
      ? await this.repo.listOwn(rest, userId)
      : await this.repo.listOwnOrShared(rest, userId);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ReportTemplateRow> {
    await this.assertModuleEnabled();
    const userId = this.requireUserId();
    const row = await this.repo.findById(id);
    if (row === null) throw new ReportTemplateNotFoundError(id);
    if (row.ownedByUserId !== userId && !row.isShared) {
      throw new ReportTemplateNotFoundError(id);
    }
    return row;
  }

  public async create(
    args: CreateReportTemplateArgs,
  ): Promise<ReportTemplateRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const code = await this.allocateCode(tx);
      const created = await this.repo.create(
        {
          code,
          name: args.name,
          description: args.description ?? null,
          reportKind: args.reportKind,
          params: args.params,
          isShared: args.isShared ?? false,
          ownedByUserId: userId,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.TEMPLATE_CREATED,
        eventType: 'ReportTemplateCreated',
        aggregateType: 'ReportTemplate',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          name: created.name,
          reportKind: created.reportKind,
          isShared: created.isShared,
          ownedByUserId: created.ownedByUserId,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-template.create',
          category: 'general',
          resourceType: 'ReportTemplate',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Report template created id=${created.id} code="${created.code}" kind=${created.reportKind}.`,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateReportTemplateArgs,
  ): Promise<ReportTemplateRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const userId = this.requireUserId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportTemplateNotFoundError(id);
      if (current.ownedByUserId !== userId) {
        throw new ReportTemplateNotOwnedError(id);
      }

      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.TEMPLATE_UPDATED,
        eventType: 'ReportTemplateUpdated',
        aggregateType: 'ReportTemplate',
        aggregateId: id,
        payload: { id, code: updated.code, name: updated.name },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-template.update',
          category: 'general',
          resourceType: 'ReportTemplate',
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
      const userId = this.requireUserId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new ReportTemplateNotFoundError(id);
      if (current.ownedByUserId !== userId) {
        throw new ReportTemplateNotOwnedError(id);
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.TEMPLATE_DELETED,
        eventType: 'ReportTemplateDeleted',
        aggregateType: 'ReportTemplate',
        aggregateId: id,
        payload: { id, code: current.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'report-template.delete',
          category: 'general',
          resourceType: 'ReportTemplate',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.REPORT_TEMPLATE, { tx });
    return `TPL-${seq.toString().padStart(6, '0')}`;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ReportTemplateService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private requireUserId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('ReportTemplateService requires an authenticated user.');
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
