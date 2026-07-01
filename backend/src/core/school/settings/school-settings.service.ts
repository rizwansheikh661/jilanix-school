/**
 * SchoolSettingsService — exposes `/school/settings` GET + PATCH for the
 * tenant on the request context.
 *
 *   - getOrCreateForCurrentSchool() — read-or-materialise. The first GET
 *     against a fresh tenant creates the row with the canonical defaults;
 *     subsequent reads hit the existing row.
 *   - update(expectedVersion, patch) — version-guarded PATCH with outbox
 *     publish (`provisioning.school.settings.updated`) and audit row in
 *     the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { ProvisioningOutboxTopics } from '../../provisioning/provisioning.constants';
import { RequestContextRegistry } from '../../request-context';
import {
  SchoolSettingsRepository,
  type UpdateSchoolSettingsInput,
} from './school-settings.repository';
import type { SchoolSettingsRow } from './school-settings.types';

export interface UpdateSchoolSettingsArgs extends UpdateSchoolSettingsInput {}

@Injectable()
export class SchoolSettingsService {
  private readonly logger = new Logger(SchoolSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolSettingsRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async getOrCreateForCurrentSchool(): Promise<SchoolSettingsRow> {
    const existing = await this.repo.findForCurrentSchool();
    if (existing !== null) return existing;
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const reread = await this.repo.findForCurrentSchool(tx);
      if (reread !== null) return reread;
      const created = await this.repo.createDefaultsForCurrentSchool(tx);
      this.logger.log(`SchoolSettings materialised id=${created.id} for school=${created.schoolId}.`);
      return created;
    });
  }

  public async update(
    expectedVersion: number,
    patch: UpdateSchoolSettingsArgs,
  ): Promise<SchoolSettingsRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const before = await this.repo.findForCurrentSchool(tx);
      const updated = await this.repo.update(expectedVersion, patch, tx);

      const ctx = RequestContextRegistry.peek();
      const schoolId = ctx?.schoolId ?? updated.schoolId;

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.SCHOOL_SETTINGS_UPDATED,
        eventType: 'SchoolSettingsUpdated',
        aggregateType: 'SchoolSettings',
        aggregateId: updated.id,
        schoolId,
        payload: {
          id: updated.id,
          schoolId: updated.schoolId,
          version: updated.version,
        },
      });

      await this.audit.record(
        {
          action: 'school.settings.update',
          category: 'tenancy',
          resourceType: 'SchoolSettings',
          resourceId: updated.id,
          schoolId,
          before,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `SchoolSettings ${updated.id} updated → v${updated.version.toString()}.`,
      );
      return updated;
    });
  }
}
