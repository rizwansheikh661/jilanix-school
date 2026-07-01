/**
 * BillingSettingsService — per-school billing settings (1:1 with
 * BillingAccount). Reads are open; updates are gated by `module.billing`,
 * wrapped in a single tx with outbox `SETTINGS_UPDATED` + tenancy audit.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { BillingOutboxTopics } from '../billing.constants';
import { BillingAccountNotFoundError } from '../billing.errors';
import { assertBillingEnabled } from '../billing.shared';
import type { BillingSettingsRow } from '../billing.types';
import { BillingAccountRepository } from '../account/billing-account.repository';
import type { PrismaTx } from '../../../infra/prisma/types';
import {
  BillingSettingsRepository,
  type UpdateBillingSettingsInput,
} from './billing-settings.repository';

@Injectable()
export class BillingSettingsService {
  private readonly logger = new Logger(BillingSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BillingSettingsRepository,
    private readonly accountRepo: BillingAccountRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async getSettings(accountId: string): Promise<BillingSettingsRow> {
    const row = await this.repo.findByAccountId(accountId);
    if (row === null) throw new BillingAccountNotFoundError(accountId);
    return row;
  }

  public async getSettingsBySchoolId(schoolId: string): Promise<BillingSettingsRow> {
    const row = await this.repo.findBySchoolId(schoolId);
    if (row === null) throw new BillingAccountNotFoundError(schoolId);
    return row;
  }

  public async updateSettings(
    accountId: string,
    expectedVersion: number,
    patch: UpdateBillingSettingsInput,
  ): Promise<BillingSettingsRow> {
    const account = await this.accountRepo.findById(accountId);
    if (account === null) throw new BillingAccountNotFoundError(accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findByAccountId(accountId, tx);
      if (existing === null) throw new BillingAccountNotFoundError(accountId);
      const updated = await this.repo.update(existing.id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.SETTINGS_UPDATED,
        eventType: 'BillingSettingsUpdated',
        aggregateType: 'BillingSettings',
        aggregateId: updated.id,
        schoolId: account.schoolId,
        payload: {
          accountId,
          settingsId: updated.id,
          schoolId: account.schoolId,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.settings.updated',
          category: 'tenancy',
          resourceType: 'BillingSettings',
          resourceId: updated.id,
          schoolId: account.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `BillingSettings updated accountId=${accountId} schoolId=${account.schoolId}.`,
      );
      return updated;
    });
  }
}
