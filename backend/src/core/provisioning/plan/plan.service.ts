/**
 * PlanService — CRUD + lifecycle orchestration for the Sprint 14 Plan
 * catalog. Wave 2 ships the controller-facing surface; feature-flag gating
 * and the public-facing `/plans` (read-only) view land in later waves.
 *
 * Mutations publish to the outbox in the same transaction as the row write.
 * Audit category `tenancy` (plans drive tenant lifecycle), per the audit-
 * category contract in `audit.types.ts`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { ProvisioningOutboxTopics } from '../provisioning.constants';
import {
  PlanCodeConflictError,
  PlanInUseError,
  PlanNotFoundError,
} from '../provisioning.errors';
import type { PlanRow } from '../provisioning.types';
import {
  PlanRepository,
  type CreatePlanInput,
  type ListPlansArgs,
  type UpdatePlanInput,
} from './plan.repository';

export interface CreatePlanArgs extends CreatePlanInput {}
export interface UpdatePlanArgs extends UpdatePlanInput {}
export interface ListPlansServiceArgs extends ListPlansArgs {}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PlanRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    args: ListPlansServiceArgs,
  ): Promise<{
    readonly items: readonly PlanRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<PlanRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new PlanNotFoundError(id);
    return row;
  }

  public async create(args: CreatePlanArgs): Promise<PlanRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const existing = await this.repo.findActiveByCode(args.code, tx);
      if (existing !== null) throw new PlanCodeConflictError(args.code);

      const created = await this.repo.create(args, tx);

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PLAN_CREATED,
        eventType: 'PlanCreated',
        aggregateType: 'Plan',
        aggregateId: created.id,
        payload: {
          id: created.id,
          code: created.code,
          name: created.name,
          defaultTrialDays: created.defaultTrialDays,
        },
      });

      await this.audit.record(
        {
          action: 'provisioning.plan.create',
          category: 'tenancy',
          resourceType: 'Plan',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Plan created id=${created.id} code="${created.code}" name="${created.name}".`,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdatePlanArgs,
  ): Promise<PlanRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PlanNotFoundError(id);

      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PLAN_UPDATED,
        eventType: 'PlanUpdated',
        aggregateType: 'Plan',
        aggregateId: id,
        payload: { id, code: updated.code, name: updated.name },
      });

      await this.audit.record(
        {
          action: 'provisioning.plan.update',
          category: 'tenancy',
          resourceType: 'Plan',
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
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new PlanNotFoundError(id);

      const referenceCount = await this.repo.countSchoolsUsing(id, tx);
      if (referenceCount > 0) {
        throw new PlanInUseError(id, referenceCount);
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PLAN_DELETED,
        eventType: 'PlanDeleted',
        aggregateType: 'Plan',
        aggregateId: id,
        payload: { id, code: current.code },
      });

      await this.audit.record(
        {
          action: 'provisioning.plan.delete',
          category: 'tenancy',
          resourceType: 'Plan',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }
}
