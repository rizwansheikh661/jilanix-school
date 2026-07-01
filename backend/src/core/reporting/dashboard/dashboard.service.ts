/**
 * DashboardService — CRUD orchestration for Dashboard + DashboardWidget.
 *
 * Pipeline: `module.reporting` gate on every entrypoint. Sequence-allocated
 * DSH-<seq> code (non-FY). Soft-delete cascades to widgets in the same tx.
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
  MAX_WIDGETS_PER_DASHBOARD,
  ReportingFeatureFlags,
  ReportingOutboxTopics,
  type DashboardWidgetKindValue,
} from '../reporting.constants';
import {
  DashboardNotFoundError,
  DashboardWidgetCapExceededError,
  DashboardWidgetNotFoundError,
  ReportingModuleDisabledError,
} from '../reporting.errors';
import type { DashboardRow, DashboardWidgetRow } from '../reporting.types';
import { DashboardWidgetRepository } from './dashboard-widget.repository';
import {
  DashboardRepository,
  type ListDashboardsArgs,
} from './dashboard.repository';

export interface CreateDashboardArgs {
  readonly name: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

export interface UpdateDashboardArgs {
  readonly name?: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

export interface CreateDashboardWidgetArgs {
  readonly kind: DashboardWidgetKindValue;
  readonly position: number;
  readonly title: string;
  readonly config: Record<string, unknown>;
}

export interface UpdateDashboardWidgetArgs {
  readonly kind?: DashboardWidgetKindValue;
  readonly position?: number;
  readonly title?: string;
  readonly config?: Record<string, unknown>;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DashboardRepository,
    private readonly widgetRepo: DashboardWidgetRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListDashboardsArgs): Promise<{
    readonly items: readonly DashboardRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<DashboardRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new DashboardNotFoundError(id);
    return row;
  }

  public async create(args: CreateDashboardArgs): Promise<DashboardRow> {
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
          isDefault: args.isDefault ?? false,
          ownedByUserId: userId,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_CREATED,
        eventType: 'DashboardCreated',
        aggregateType: 'Dashboard',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          name: created.name,
          isDefault: created.isDefault,
          ownedByUserId: created.ownedByUserId,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.create',
          category: 'general',
          resourceType: 'Dashboard',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Dashboard created id=${created.id} code="${created.code}" name="${created.name}".`,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateDashboardArgs,
  ): Promise<DashboardRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new DashboardNotFoundError(id);

      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_UPDATED,
        eventType: 'DashboardUpdated',
        aggregateType: 'Dashboard',
        aggregateId: id,
        payload: { id, code: updated.code, name: updated.name },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.update',
          category: 'general',
          resourceType: 'Dashboard',
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
      if (current === null) throw new DashboardNotFoundError(id);

      await this.widgetRepo.softDeleteAllForDashboard(id, tx);
      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_DELETED,
        eventType: 'DashboardDeleted',
        aggregateType: 'Dashboard',
        aggregateId: id,
        payload: { id, code: current.code },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.delete',
          category: 'general',
          resourceType: 'Dashboard',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  public async listWidgets(
    dashboardId: string,
  ): Promise<readonly DashboardWidgetRow[]> {
    await this.assertModuleEnabled();
    const dashboard = await this.repo.findById(dashboardId);
    if (dashboard === null) throw new DashboardNotFoundError(dashboardId);
    return this.widgetRepo.listByDashboard(dashboardId);
  }

  public async addWidget(
    dashboardId: string,
    args: CreateDashboardWidgetArgs,
  ): Promise<DashboardWidgetRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const dashboard = await this.repo.findById(dashboardId, tx);
      if (dashboard === null) throw new DashboardNotFoundError(dashboardId);

      const count = await this.widgetRepo.countByDashboard(dashboardId, tx);
      if (count >= MAX_WIDGETS_PER_DASHBOARD) {
        throw new DashboardWidgetCapExceededError(
          dashboardId,
          MAX_WIDGETS_PER_DASHBOARD,
        );
      }

      const created = await this.widgetRepo.create(
        {
          dashboardId,
          kind: args.kind,
          position: args.position,
          title: args.title,
          config: args.config,
        },
        tx,
      );

      // No per-widget outbox topic; surface as a dashboard-level update.
      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_UPDATED,
        eventType: 'DashboardWidgetAdded',
        aggregateType: 'Dashboard',
        aggregateId: dashboardId,
        payload: {
          dashboardId,
          widgetId: created.id,
          kind: created.kind,
          position: created.position,
        },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.widget.add',
          category: 'general',
          resourceType: 'DashboardWidget',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return created;
    });
  }

  public async updateWidget(
    dashboardId: string,
    widgetId: string,
    expectedVersion: number,
    patch: UpdateDashboardWidgetArgs,
  ): Promise<DashboardWidgetRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const dashboard = await this.repo.findById(dashboardId, tx);
      if (dashboard === null) throw new DashboardNotFoundError(dashboardId);

      const current = await this.widgetRepo.findById(dashboardId, widgetId, tx);
      if (current === null) throw new DashboardWidgetNotFoundError(widgetId);

      const updated = await this.widgetRepo.update(
        dashboardId,
        widgetId,
        expectedVersion,
        patch,
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_UPDATED,
        eventType: 'DashboardWidgetUpdated',
        aggregateType: 'Dashboard',
        aggregateId: dashboardId,
        payload: { dashboardId, widgetId },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.widget.update',
          category: 'general',
          resourceType: 'DashboardWidget',
          resourceId: widgetId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async removeWidget(
    dashboardId: string,
    widgetId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const dashboard = await this.repo.findById(dashboardId, tx);
      if (dashboard === null) throw new DashboardNotFoundError(dashboardId);

      const current = await this.widgetRepo.findById(dashboardId, widgetId, tx);
      if (current === null) throw new DashboardWidgetNotFoundError(widgetId);

      await this.widgetRepo.softDelete(
        dashboardId,
        widgetId,
        expectedVersion,
        tx,
      );

      await this.outbox.publish(tx, {
        topic: ReportingOutboxTopics.DASHBOARD_UPDATED,
        eventType: 'DashboardWidgetRemoved',
        aggregateType: 'Dashboard',
        aggregateId: dashboardId,
        payload: { dashboardId, widgetId },
        schoolId,
      });

      await this.audit.record(
        {
          action: 'dashboard.widget.remove',
          category: 'general',
          resourceType: 'DashboardWidget',
          resourceId: widgetId,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.DASHBOARD, { tx });
    return `DSH-${seq.toString().padStart(6, '0')}`;
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('DashboardService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private requireUserId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('DashboardService requires an authenticated user.');
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
