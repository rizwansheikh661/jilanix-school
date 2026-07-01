/**
 * UsageThresholdStateRepository — singleton row per (school, featureKey)
 * holding the last-notified threshold band so the guard's edge-trigger
 * notification dispatch fires at most once per band crossing.
 *
 * Caller workflow:
 *   1) `upsert(...)` to ensure the row exists (no-op if present).
 *   2) `tryAdvanceBand(...)` to compare-and-set the band. Returns the new
 *      band if it advanced, null otherwise. Notification dispatch is the
 *      caller's responsibility based on that return value.
 *   3) `setPercent(...)` to refresh the cached percent (idempotent reset
 *      to a lower band when usage drops, e.g. after recompute).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { UsageThresholdStateRow, UsageThresholdValue } from '../subscription.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'super-admin threshold op' }),
  }),
});

const BAND_RANK: Readonly<Record<UsageThresholdValue, number>> = Object.freeze({
  THRESHOLD_80: 80,
  THRESHOLD_90: 90,
  LIMIT_REACHED: 100,
});

function bandRank(value: UsageThresholdValue | null): number {
  return value === null ? 0 : BAND_RANK[value];
}

@Injectable()
export class UsageThresholdStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async find(
    schoolId: string,
    featureKey: string,
    tx?: PrismaTx,
  ): Promise<UsageThresholdStateRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.usageThresholdState.findFirst({
      where: { schoolId, featureKey },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as unknown as RawState);
  }

  public async upsert(
    schoolId: string,
    featureKey: string,
    tx: PrismaTx,
  ): Promise<UsageThresholdStateRow> {
    const existing = await this.find(schoolId, featureKey, tx);
    if (existing !== null) return existing;
    const row = await tx.usageThresholdState.create({
      data: {
        id: randomUUID(),
        schoolId,
        featureKey,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(row as unknown as RawState);
  }

  /**
   * Atomically advance the persisted band if `newBand` outranks the current.
   * Returns the row + a `crossed` flag: true means caller should dispatch
   * the threshold notification, false means same/lower band (no-op).
   */
  public async tryAdvanceBand(
    schoolId: string,
    featureKey: string,
    newBand: UsageThresholdValue,
    currentPercent: number,
    tx: PrismaTx,
  ): Promise<{ readonly row: UsageThresholdStateRow; readonly crossed: boolean }> {
    const existing = await this.upsert(schoolId, featureKey, tx);
    if (bandRank(newBand) <= bandRank(existing.lastNotifiedThreshold)) {
      // Same band or below — refresh percent only.
      const updated = await this.setPercent(schoolId, existing.id, currentPercent, existing.version, tx);
      return { row: updated, crossed: false };
    }
    const now = new Date();
    const result = await tx.usageThresholdState.updateMany({
      where: { schoolId, id: existing.id, version: existing.version },
      data: {
        lastNotifiedThreshold: newBand,
        lastNotifiedAt: now,
        currentPercent,
        version: { increment: 1 },
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      // Another worker raced us — re-read and report no crossing on this
      // call (the other writer already crossed it).
      const reloaded = await this.find(schoolId, featureKey, tx);
      return {
        row: reloaded ?? existing,
        crossed: false,
      };
    }
    const reloaded = await tx.usageThresholdState.findUnique({
      where: { schoolId_id: { schoolId, id: existing.id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return {
      row: reloaded === null ? existing : mapRow(reloaded as unknown as RawState),
      crossed: true,
    };
  }

  public async setPercent(
    schoolId: string,
    id: string,
    currentPercent: number,
    expectedVersion: number,
    tx: PrismaTx,
  ): Promise<UsageThresholdStateRow> {
    await tx.usageThresholdState.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: {
        currentPercent,
        version: { increment: 1 },
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const reloaded = await tx.usageThresholdState.findUnique({
      where: { schoolId_id: { schoolId, id } },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new Error(`UsageThresholdState ${id} disappeared mid-update.`);
    }
    return mapRow(reloaded as unknown as RawState);
  }

  /**
   * Reset semantics for the next billing period (clears the cached band so
   * the next crossing fires again).
   */
  public async resetBand(
    schoolId: string,
    featureKey: string,
    tx: PrismaTx,
  ): Promise<void> {
    await tx.usageThresholdState.updateMany({
      where: { schoolId, featureKey },
      data: {
        lastNotifiedThreshold: null,
        lastNotifiedAt: null,
        currentPercent: 0,
        version: { increment: 1 },
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
  }
}

export function deriveBand(percent: number): UsageThresholdValue | null {
  if (percent >= 100) return 'LIMIT_REACHED';
  if (percent >= 90) return 'THRESHOLD_90';
  if (percent >= 80) return 'THRESHOLD_80';
  return null;
}

interface RawState {
  id: string;
  schoolId: string;
  featureKey: string;
  lastNotifiedThreshold: UsageThresholdValue | null;
  lastNotifiedAt: Date | null;
  currentPercent: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: RawState): UsageThresholdStateRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    featureKey: row.featureKey,
    lastNotifiedThreshold: row.lastNotifiedThreshold,
    lastNotifiedAt: row.lastNotifiedAt,
    currentPercent: row.currentPercent,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
