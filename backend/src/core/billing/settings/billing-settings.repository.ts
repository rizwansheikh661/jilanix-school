/**
 * BillingSettingsRepository — per-school billing settings (1:1 with
 * BillingAccount). Holds grace period, reminders, default payment source.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import {
  BILLING_DEFAULT_BILLING_LEAD_DAYS,
  BILLING_DEFAULT_GRACE_PERIOD_DAYS,
} from '../billing.constants';
import type { BillingSettingsRow } from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform billing settings op' }),
  }),
});

export interface CreateBillingSettingsInput {
  readonly accountId: string;
  readonly schoolId: string;
  readonly gracePeriodDays?: number;
  readonly billingLeadDays?: number;
  readonly autoChargeEnabled?: boolean;
  readonly defaultPaymentSourceId?: string | null;
  readonly invoicePrefix?: string | null;
  readonly remindersEnabled?: boolean;
  readonly reminderOffsetsJson?: unknown;
}

export interface UpdateBillingSettingsInput {
  readonly gracePeriodDays?: number;
  readonly billingLeadDays?: number;
  readonly autoChargeEnabled?: boolean;
  readonly defaultPaymentSourceId?: string | null;
  readonly invoicePrefix?: string | null;
  readonly remindersEnabled?: boolean;
  readonly reminderOffsetsJson?: unknown;
}

@Injectable()
export class BillingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findByAccountId(
    accountId: string,
    tx?: PrismaTx,
  ): Promise<BillingSettingsRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingSettings.findFirst({
      where: { accountId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawSettings);
  }

  public async findBySchoolId(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<BillingSettingsRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingSettings.findFirst({
      where: { schoolId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapRow(row as RawSettings);
  }

  public async create(
    input: CreateBillingSettingsInput,
    tx?: PrismaTx,
  ): Promise<BillingSettingsRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.billingSettings.create({
      data: {
        id: randomUUID(),
        accountId: input.accountId,
        schoolId: input.schoolId,
        gracePeriodDays: input.gracePeriodDays ?? BILLING_DEFAULT_GRACE_PERIOD_DAYS,
        billingLeadDays: input.billingLeadDays ?? BILLING_DEFAULT_BILLING_LEAD_DAYS,
        autoChargeEnabled: input.autoChargeEnabled ?? false,
        defaultPaymentSourceId: input.defaultPaymentSourceId ?? null,
        invoicePrefix: input.invoicePrefix ?? null,
        remindersEnabled: input.remindersEnabled ?? true,
        reminderOffsetsJson: input.reminderOffsetsJson ?? null,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapRow(created as RawSettings);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateBillingSettingsInput,
    tx?: PrismaTx,
  ): Promise<BillingSettingsRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.gracePeriodDays !== undefined) data.gracePeriodDays = patch.gracePeriodDays;
    if (patch.billingLeadDays !== undefined) data.billingLeadDays = patch.billingLeadDays;
    if (patch.autoChargeEnabled !== undefined) data.autoChargeEnabled = patch.autoChargeEnabled;
    if (patch.defaultPaymentSourceId !== undefined) {
      data.defaultPaymentSourceId = patch.defaultPaymentSourceId;
    }
    if (patch.invoicePrefix !== undefined) data.invoicePrefix = patch.invoicePrefix;
    if (patch.remindersEnabled !== undefined) data.remindersEnabled = patch.remindersEnabled;
    if (patch.reminderOffsetsJson !== undefined) {
      data.reminderOffsetsJson = patch.reminderOffsetsJson;
    }

    const result = await writer.billingSettings.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('BillingSettings', id, expectedVersion);
    }
    const reloaded = await writer.billingSettings.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('BillingSettings', id, expectedVersion);
    }
    return mapRow(reloaded as RawSettings);
  }
}

interface RawSettings {
  id: string;
  accountId: string;
  schoolId: string;
  gracePeriodDays: number;
  billingLeadDays: number;
  autoChargeEnabled: boolean;
  defaultPaymentSourceId: string | null;
  invoicePrefix: string | null;
  remindersEnabled: boolean;
  reminderOffsetsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapRow(row: RawSettings): BillingSettingsRow {
  return {
    id: row.id,
    accountId: row.accountId,
    schoolId: row.schoolId,
    gracePeriodDays: row.gracePeriodDays,
    billingLeadDays: row.billingLeadDays,
    autoChargeEnabled: row.autoChargeEnabled,
    defaultPaymentSourceId: row.defaultPaymentSourceId,
    invoicePrefix: row.invoicePrefix,
    remindersEnabled: row.remindersEnabled,
    reminderOffsetsJson: row.reminderOffsetsJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
