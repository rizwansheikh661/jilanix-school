/**
 * DashboardWidgetRepository — persistence for `dashboard_widgets` rows.
 *
 * Widgets are scoped to their parent dashboard. update/softDelete are guarded
 * `updateMany` calls so concurrent mutations short-circuit via
 * VersionConflictError. `deleteAllForDashboard` cascades when the parent is
 * soft-deleted; it does not require per-widget version checks.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { DashboardWidgetKindValue } from '../reporting.constants';
import type { DashboardWidgetRow } from '../reporting.types';

export interface CreateDashboardWidgetInput {
  readonly dashboardId: string;
  readonly kind: DashboardWidgetKindValue;
  readonly position: number;
  readonly title: string;
  readonly config: Record<string, unknown>;
}

export interface UpdateDashboardWidgetInput {
  readonly kind?: DashboardWidgetKindValue;
  readonly position?: number;
  readonly title?: string;
  readonly config?: Record<string, unknown>;
}

@Injectable()
export class DashboardWidgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('DashboardWidgetRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    dashboardId: string,
    widgetId: string,
    tx?: PrismaTx,
  ): Promise<DashboardWidgetRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.dashboardWidget.findFirst({
      where: { schoolId, dashboardId, id: widgetId, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawDashboardWidget);
  }

  public async listByDashboard(
    dashboardId: string,
    tx?: PrismaTx,
  ): Promise<readonly DashboardWidgetRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.dashboardWidget.findMany({
      where: { schoolId, dashboardId, deletedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => mapRow(r as unknown as RawDashboardWidget));
  }

  public async countByDashboard(
    dashboardId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.dashboardWidget.count({
      where: { schoolId, dashboardId, deletedAt: null },
    });
  }

  public async create(
    input: CreateDashboardWidgetInput,
    tx?: PrismaTx,
  ): Promise<DashboardWidgetRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      schoolId,
      dashboardId: input.dashboardId,
      kind: input.kind,
      position: input.position,
      title: input.title,
      config: input.config as Prisma.InputJsonValue,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    };
    const created = await writer.dashboardWidget.create({
      data: data as never,
    });
    return mapRow(created as unknown as RawDashboardWidget);
  }

  public async update(
    dashboardId: string,
    widgetId: string,
    expectedVersion: number,
    patch: UpdateDashboardWidgetInput,
    tx?: PrismaTx,
  ): Promise<DashboardWidgetRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.kind !== undefined) data.kind = patch.kind;
    if (patch.position !== undefined) data.position = patch.position;
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.config !== undefined) {
      data.config = patch.config as Prisma.InputJsonValue;
    }
    const result = await writer.dashboardWidget.updateMany({
      where: {
        schoolId,
        dashboardId,
        id: widgetId,
        version: expectedVersion,
        deletedAt: null,
      },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('DashboardWidget', widgetId, expectedVersion);
    }
    const reloaded = await writer.dashboardWidget.findUnique({
      where: { schoolId_id: { schoolId, id: widgetId } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('DashboardWidget', widgetId, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawDashboardWidget);
  }

  public async softDelete(
    dashboardId: string,
    widgetId: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.dashboardWidget.updateMany({
      where: {
        schoolId,
        dashboardId,
        id: widgetId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('DashboardWidget', widgetId, expectedVersion);
    }
  }

  public async softDeleteAllForDashboard(
    dashboardId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.dashboardWidget.updateMany({
      where: { schoolId, dashboardId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
  }
}

interface RawDashboardWidget {
  id: string;
  schoolId: string;
  dashboardId: string;
  kind: string;
  position: number;
  title: string;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

function mapRow(row: RawDashboardWidget): DashboardWidgetRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    dashboardId: row.dashboardId,
    kind: row.kind as DashboardWidgetKindValue,
    position: row.position,
    title: row.title,
    config: (row.config ?? {}) as Record<string, unknown>,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
