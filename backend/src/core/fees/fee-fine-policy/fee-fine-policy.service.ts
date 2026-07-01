/**
 * FeeLateFinePolicyService — orchestration for late-fine policy CRUD.
 *
 * Validation gates:
 *   1. `module.fees` feature flag.
 *   2. Duplicate-code guard (active rows only).
 *   3. `value >= 0`; PERCENT_PER_DAY clamps to 0..100.
 *   4. `gracePeriodDays` integer in [0..FEE_FINE_GRACE_DAYS_MAX].
 *   5. Optional `capAmount >= 0`.
 *   6. Delete refused if any active (non-archived) FeeStructureLine refs.
 *
 * Mutations publish an outbox event + write a finance audit row inside
 * the same transaction.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  FEE_FINE_GRACE_DAYS_MAX,
  FeesFeatureFlags,
  FeesOutboxTopics,
} from '../fees.constants';
import {
  DiscountValueInvalidError,
  DuplicateFineePolicyCodeError,
  FeeLateFinePolicyNotFoundError,
  FeesInUseError,
  FeesModuleDisabledError,
} from '../fees.errors';
import type { FeeFinePolicyTypeValue } from '../fees.constants';
import type { FeeLateFinePolicyRow } from '../fees.types';
import {
  FeeLateFinePolicyRepository,
  type ListFeeLateFinePolicyArgs,
} from './fee-fine-policy.repository';

export interface CreateFeeLateFinePolicyArgs {
  readonly code: string;
  readonly name: string;
  readonly type: FeeFinePolicyTypeValue;
  readonly value: number;
  readonly gracePeriodDays: number;
  readonly capAmount?: number | null;
  readonly description?: string | null;
}

export interface UpdateFeeLateFinePolicyArgs {
  readonly code?: string;
  readonly name?: string;
  readonly type?: FeeFinePolicyTypeValue;
  readonly value?: number;
  readonly gracePeriodDays?: number;
  readonly capAmount?: number | null;
  readonly description?: string | null;
}

@Injectable()
export class FeeLateFinePolicyService {
  private readonly logger = new Logger(FeeLateFinePolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeLateFinePolicyRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListFeeLateFinePolicyArgs): Promise<{
    readonly items: readonly FeeLateFinePolicyRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<FeeLateFinePolicyRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new FeeLateFinePolicyNotFoundError(id);
    return row;
  }

  public async create(
    args: CreateFeeLateFinePolicyArgs,
  ): Promise<FeeLateFinePolicyRow> {
    await this.assertModuleEnabled();
    this.validateValue(args.type, args.value);
    this.validateGracePeriod(args.gracePeriodDays);
    if (args.capAmount !== undefined && args.capAmount !== null) {
      this.validateCapAmount(args.capAmount);
    }

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByCode(args.code, tx);
      if (dup !== null) throw new DuplicateFineePolicyCodeError(args.code);

      const row = await this.repo.create(
        {
          code: args.code,
          name: args.name,
          type: args.type,
          value: args.value,
          gracePeriodDays: args.gracePeriodDays,
          ...(args.capAmount !== undefined ? { capAmount: args.capAmount } : {}),
          ...(args.description !== undefined
            ? { description: args.description }
            : {}),
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.FINE_POLICY_CREATED,
        eventType: 'FeeLateFinePolicyCreated',
        aggregateType: 'FeeLateFinePolicy',
        aggregateId: row.id,
        payload: {
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          value: row.value,
          gracePeriodDays: row.gracePeriodDays,
        },
      });

      await this.audit.record(
        {
          action: 'fee_fine_policy.create',
          category: 'finance',
          resourceType: 'FeeLateFinePolicy',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeLateFinePolicy created id=${row.id} code="${row.code}" type=${row.type}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateFeeLateFinePolicyArgs,
  ): Promise<FeeLateFinePolicyRow> {
    await this.assertModuleEnabled();
    if (args.gracePeriodDays !== undefined) {
      this.validateGracePeriod(args.gracePeriodDays);
    }
    if (args.capAmount !== undefined && args.capAmount !== null) {
      this.validateCapAmount(args.capAmount);
    }

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeLateFinePolicyNotFoundError(id);

      const nextType = args.type ?? current.type;
      const nextValue = args.value ?? current.value;
      if (args.type !== undefined || args.value !== undefined) {
        this.validateValue(nextType, nextValue);
      }

      if (args.code !== undefined && args.code !== current.code) {
        const dup = await this.repo.findActiveByCode(args.code, tx);
        if (dup !== null && dup.id !== id) {
          throw new DuplicateFineePolicyCodeError(args.code);
        }
      }

      const patch: Record<string, unknown> = {};
      if (args.code !== undefined) patch.code = args.code;
      if (args.name !== undefined) patch.name = args.name;
      if (args.type !== undefined) patch.type = args.type;
      if (args.value !== undefined) patch.value = args.value;
      if (args.gracePeriodDays !== undefined) {
        patch.gracePeriodDays = args.gracePeriodDays;
      }
      if (args.capAmount !== undefined) patch.capAmount = args.capAmount;
      if (args.description !== undefined) patch.description = args.description;
      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.FINE_POLICY_UPDATED,
        eventType: 'FeeLateFinePolicyUpdated',
        aggregateType: 'FeeLateFinePolicy',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          name: updated.name,
          type: updated.type,
          value: updated.value,
          gracePeriodDays: updated.gracePeriodDays,
        },
      });

      await this.audit.record(
        {
          action: 'fee_fine_policy.update',
          category: 'finance',
          resourceType: 'FeeLateFinePolicy',
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
      if (current === null) throw new FeeLateFinePolicyNotFoundError(id);
      const refs = await this.repo.countActiveStructureLineRefs(id, tx);
      if (refs > 0) {
        throw new FeesInUseError('FeeLateFinePolicy', id, 'FeeStructureLine');
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.FINE_POLICY_DELETED,
        eventType: 'FeeLateFinePolicyDeleted',
        aggregateType: 'FeeLateFinePolicy',
        aggregateId: id,
        payload: { id, code: current.code, name: current.name },
      });
      await this.audit.record(
        {
          action: 'fee_fine_policy.delete',
          category: 'finance',
          resourceType: 'FeeLateFinePolicy',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeLateFinePolicy soft-deleted id=${id}.`);
    });
  }

  // ---------------------------------------------------------------------
  // Internal validators
  // ---------------------------------------------------------------------

  private validateValue(type: FeeFinePolicyTypeValue, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new DiscountValueInvalidError(
        `fine value must be >= 0; got ${value}`,
      );
    }
    if (type === 'PERCENT_PER_DAY' && value > 100) {
      throw new DiscountValueInvalidError(
        `PERCENT_PER_DAY value must be in [0..100]; got ${value}`,
      );
    }
  }

  private validateGracePeriod(value: number): void {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > FEE_FINE_GRACE_DAYS_MAX
    ) {
      throw new DiscountValueInvalidError(
        `gracePeriodDays must be an integer in [0..${FEE_FINE_GRACE_DAYS_MAX}]; got ${value}`,
      );
    }
  }

  private validateCapAmount(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new DiscountValueInvalidError(
        `capAmount must be >= 0; got ${value}`,
      );
    }
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
