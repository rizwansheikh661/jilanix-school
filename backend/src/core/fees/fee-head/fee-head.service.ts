/**
 * FeeHeadService — orchestration for fee-head CRUD.
 *
 * Validation gates:
 *   1. `module.fees` feature flag.
 *   2. Duplicate-code guard (active rows only).
 *   3. Delete refused if any non-archived structure line references the head.
 *
 * Every mutation publishes a `fees.head.*` outbox event and writes a
 * finance-category audit row inside the same transaction (finance hash
 * chain). Soft-delete uses optimistic concurrency (`expectedVersion`).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  FeesFeatureFlags,
  FeesOutboxTopics,
  type FeeHeadCategoryValue,
} from '../fees.constants';
import {
  DuplicateFeeHeadCodeError,
  FeeHeadNotFoundError,
  FeesInUseError,
  FeesModuleDisabledError,
} from '../fees.errors';
import type { FeeHeadRow } from '../fees.types';
import {
  FeeHeadRepository,
  type ListFeeHeadArgs,
} from './fee-head.repository';

export interface CreateFeeHeadArgs {
  readonly code: string;
  readonly name: string;
  readonly category: FeeHeadCategoryValue;
  readonly hsnSac?: string | null;
  readonly isRefundable?: boolean;
  readonly isTaxable?: boolean;
  readonly defaultAmount?: number | null;
  readonly glAccount?: string | null;
  readonly description?: string | null;
}

export interface UpdateFeeHeadArgs {
  readonly code?: string;
  readonly name?: string;
  readonly category?: FeeHeadCategoryValue;
  readonly hsnSac?: string | null;
  readonly isRefundable?: boolean;
  readonly isTaxable?: boolean;
  readonly defaultAmount?: number | null;
  readonly glAccount?: string | null;
  readonly description?: string | null;
}

@Injectable()
export class FeeHeadService {
  private readonly logger = new Logger(FeeHeadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeHeadRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListFeeHeadArgs): Promise<{
    readonly items: readonly FeeHeadRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<FeeHeadRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new FeeHeadNotFoundError(id);
    return row;
  }

  public async create(args: CreateFeeHeadArgs): Promise<FeeHeadRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByCode(args.code, tx);
      if (dup !== null) throw new DuplicateFeeHeadCodeError(args.code);

      const row = await this.repo.create(
        {
          code: args.code,
          name: args.name,
          category: args.category,
          ...(args.hsnSac !== undefined ? { hsnSac: args.hsnSac } : {}),
          ...(args.isRefundable !== undefined
            ? { isRefundable: args.isRefundable }
            : {}),
          ...(args.isTaxable !== undefined ? { isTaxable: args.isTaxable } : {}),
          ...(args.defaultAmount !== undefined
            ? { defaultAmount: args.defaultAmount }
            : {}),
          ...(args.glAccount !== undefined ? { glAccount: args.glAccount } : {}),
          ...(args.description !== undefined
            ? { description: args.description }
            : {}),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.HEAD_CREATED,
        eventType: 'FeeHeadCreated',
        aggregateType: 'FeeHead',
        aggregateId: row.id,
        payload: {
          id: row.id,
          code: row.code,
          name: row.name,
          category: row.category,
        },
      });

      await this.audit.record(
        {
          action: 'fee_head.create',
          category: 'finance',
          resourceType: 'FeeHead',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeHead created id=${row.id} code="${row.code}" category=${row.category}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateFeeHeadArgs,
  ): Promise<FeeHeadRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeHeadNotFoundError(id);

      if (args.code !== undefined && args.code !== current.code) {
        const dup = await this.repo.findActiveByCode(args.code, tx);
        if (dup !== null && dup.id !== id) {
          throw new DuplicateFeeHeadCodeError(args.code);
        }
      }

      const patch: Record<string, unknown> = {};
      if (args.code !== undefined) patch.code = args.code;
      if (args.name !== undefined) patch.name = args.name;
      if (args.category !== undefined) patch.category = args.category;
      if (args.hsnSac !== undefined) patch.hsnSac = args.hsnSac;
      if (args.isRefundable !== undefined) patch.isRefundable = args.isRefundable;
      if (args.isTaxable !== undefined) patch.isTaxable = args.isTaxable;
      if (args.defaultAmount !== undefined) patch.defaultAmount = args.defaultAmount;
      if (args.glAccount !== undefined) patch.glAccount = args.glAccount;
      if (args.description !== undefined) patch.description = args.description;

      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.HEAD_UPDATED,
        eventType: 'FeeHeadUpdated',
        aggregateType: 'FeeHead',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          name: updated.name,
          category: updated.category,
        },
      });

      await this.audit.record(
        {
          action: 'fee_head.update',
          category: 'finance',
          resourceType: 'FeeHead',
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
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeHeadNotFoundError(id);

      const refCount = await this.repo.countActiveStructureLineRefs(id, tx);
      if (refCount > 0) {
        throw new FeesInUseError('FeeHead', id, 'FeeStructureLine');
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.HEAD_DELETED,
        eventType: 'FeeHeadDeleted',
        aggregateType: 'FeeHead',
        aggregateId: id,
        payload: { id, code: current.code, name: current.name },
      });

      await this.audit.record(
        {
          action: 'fee_head.delete',
          category: 'finance',
          resourceType: 'FeeHead',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`FeeHead soft-deleted id=${id} code="${current.code}".`);
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      FeesFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new FeesModuleDisabledError();
  }
}
