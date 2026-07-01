/**
 * SchoolService (root) — façade for the `/super-admin/schools` surface.
 *
 * Responsibilities (Wave 3):
 *   - list / getById / assertExists for super-admin reads.
 *   - update(): patch legal + contact fields only. Lifecycle, plan, and
 *     suspension mutations are out of scope here — they belong on the
 *     SchoolLifecycleService landing in Wave 4.
 *
 * Mutations open a single transaction, write the row, publish a
 * `provisioning.school.updated` outbox event, and record a `tenancy` audit
 * row inside the same tx.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { NotFoundError } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { ProvisioningOutboxTopics } from '../../provisioning/provisioning.constants';
import { SchoolRootRepository, type ListSchoolsArgs, type UpdateSchoolLegalContactInput } from './school.repository';
import type { SchoolRootRow } from './school.types';

export interface ListSchoolsServiceArgs extends ListSchoolsArgs {}
export interface UpdateSchoolArgs extends UpdateSchoolLegalContactInput {}

@Injectable()
export class SchoolRootService {
  private readonly logger = new Logger(SchoolRootService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchoolRootRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    args: ListSchoolsServiceArgs,
  ): Promise<{ readonly items: readonly SchoolRootRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<SchoolRootRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('School', id);
    return row;
  }

  public async assertExists(id: string): Promise<void> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('School', id);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateSchoolArgs,
  ): Promise<SchoolRootRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new NotFoundError('School', id);

      const updated = await this.repo.updateLegalContact(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.SCHOOL_UPDATED,
        eventType: 'SchoolUpdated',
        aggregateType: 'School',
        aggregateId: id,
        schoolId: id,
        payload: {
          id,
          slug: updated.slug,
          legalName: updated.legalName,
          displayName: updated.displayName,
        },
      });

      await this.audit.record(
        {
          action: 'provisioning.school.update',
          category: 'tenancy',
          resourceType: 'School',
          resourceId: id,
          schoolId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`School ${id} legal/contact updated → v${updated.version.toString()}.`);
      return updated;
    });
  }
}
