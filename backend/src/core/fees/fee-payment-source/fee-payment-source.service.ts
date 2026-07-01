/**
 * FeePaymentSourceService — orchestration for fee-payment-source CRUD.
 *
 * Validation gates:
 *   1. `module.fees` feature flag.
 *   2. Duplicate-code guard (active rows only).
 *   3. Delete refused if any non-deleted FeePayment references the source.
 *
 * Every mutation publishes a `fees.payment_source.*` outbox event and writes
 * a finance-category audit row inside the same transaction (finance hash
 * chain). Update + soft-delete use optimistic concurrency.
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
  type FeePaymentSourceKindValue,
} from '../fees.constants';
import {
  DuplicateFeePaymentSourceCodeError,
  FeePaymentSourceNotFoundError,
  FeesInUseError,
  FeesModuleDisabledError,
} from '../fees.errors';
import type { FeePaymentSourceRow } from '../fees.types';
import {
  FeePaymentSourceRepository,
  type ListFeePaymentSourceArgs,
} from './fee-payment-source.repository';

export interface CreateFeePaymentSourceArgs {
  readonly code: string;
  readonly name: string;
  readonly kind: FeePaymentSourceKindValue;
  readonly identifier: string;
  readonly ifsc?: string | null;
  readonly holderName?: string | null;
  readonly isActive?: boolean;
  readonly description?: string | null;
}

export interface UpdateFeePaymentSourceArgs {
  readonly name?: string;
  readonly kind?: FeePaymentSourceKindValue;
  readonly identifier?: string;
  readonly ifsc?: string | null;
  readonly holderName?: string | null;
  readonly isActive?: boolean;
  readonly description?: string | null;
}

@Injectable()
export class FeePaymentSourceService {
  private readonly logger = new Logger(FeePaymentSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeePaymentSourceRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListFeePaymentSourceArgs): Promise<{
    readonly items: readonly FeePaymentSourceRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async findById(id: string): Promise<FeePaymentSourceRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new FeePaymentSourceNotFoundError(id);
    return row;
  }

  public async create(args: CreateFeePaymentSourceArgs): Promise<FeePaymentSourceRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findByCodeInTx(tx, args.code);
      if (dup !== null) throw new DuplicateFeePaymentSourceCodeError(args.code);

      const row = await this.repo.create(tx, {
        code: args.code,
        name: args.name,
        kind: args.kind,
        identifier: args.identifier,
        ...(args.ifsc !== undefined ? { ifsc: args.ifsc } : {}),
        ...(args.holderName !== undefined ? { holderName: args.holderName } : {}),
        ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
      });

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_SOURCE_CREATED,
        eventType: 'FeePaymentSourceCreated',
        aggregateType: 'FeePaymentSource',
        aggregateId: row.id,
        payload: {
          id: row.id,
          code: row.code,
          name: row.name,
          kind: row.kind,
          isActive: row.isActive,
        },
      });

      await this.audit.record(
        {
          action: 'fee_payment_source.create',
          category: 'finance',
          resourceType: 'FeePaymentSource',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeePaymentSource created id=${row.id} code="${row.code}" kind=${row.kind}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateFeePaymentSourceArgs,
  ): Promise<FeePaymentSourceRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeePaymentSourceNotFoundError(id);

      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.kind !== undefined) patch.kind = args.kind;
      if (args.identifier !== undefined) patch.identifier = args.identifier;
      if (args.ifsc !== undefined) patch.ifsc = args.ifsc;
      if (args.holderName !== undefined) patch.holderName = args.holderName;
      if (args.isActive !== undefined) patch.isActive = args.isActive;
      if (args.description !== undefined) patch.description = args.description;

      const updated = await this.repo.update(tx, id, expectedVersion, patch);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_SOURCE_UPDATED,
        eventType: 'FeePaymentSourceUpdated',
        aggregateType: 'FeePaymentSource',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          name: updated.name,
          kind: updated.kind,
          isActive: updated.isActive,
        },
      });

      await this.audit.record(
        {
          action: 'fee_payment_source.update',
          category: 'finance',
          resourceType: 'FeePaymentSource',
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
      if (current === null) throw new FeePaymentSourceNotFoundError(id);

      const ctx = RequestContextRegistry.require();
      if (ctx.schoolId === undefined) {
        throw new Error('FeePaymentSourceService requires tenant scope.');
      }
      const inUseCount = await tx.feePayment.count({
        where: {
          schoolId: ctx.schoolId,
          paymentSourceId: id,
          deletedAt: null,
        },
      });
      if (inUseCount > 0) {
        throw new FeesInUseError('FeePaymentSource', id, 'FeePayment');
      }

      await this.repo.softDelete(tx, id, expectedVersion);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.PAYMENT_SOURCE_DELETED,
        eventType: 'FeePaymentSourceDeleted',
        aggregateType: 'FeePaymentSource',
        aggregateId: id,
        payload: { id, code: current.code, name: current.name, kind: current.kind },
      });

      await this.audit.record(
        {
          action: 'fee_payment_source.delete',
          category: 'finance',
          resourceType: 'FeePaymentSource',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeePaymentSource soft-deleted id=${id} code="${current.code}".`,
      );
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
