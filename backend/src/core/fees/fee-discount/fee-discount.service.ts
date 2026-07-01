/**
 * FeeDiscountService — orchestration for fee-discount CRUD.
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
  type FeeDiscountTypeValue,
} from '../fees.constants';
import {
  DiscountValueInvalidError,
  DuplicateFeeDiscountCodeError,
  FeeDiscountNotFoundError,
  FeesInUseError,
  FeesModuleDisabledError,
} from '../fees.errors';
import type { FeeDiscountRow } from '../fees.types';
import {
  FeeDiscountRepository,
  type ListFeeDiscountArgs,
} from './fee-discount.repository';

export interface CreateFeeDiscountArgs {
  readonly code: string;
  readonly name: string;
  readonly type: FeeDiscountTypeValue;
  readonly value: number;
  readonly maxAmount?: number | null;
  readonly appliesToFeeHeadId?: string | null;
  readonly description?: string | null;
  readonly requiresApprovalAbove?: number | null;
}

export interface UpdateFeeDiscountArgs {
  readonly code?: string;
  readonly name?: string;
  readonly type?: FeeDiscountTypeValue;
  readonly value?: number;
  readonly maxAmount?: number | null;
  readonly appliesToFeeHeadId?: string | null;
  readonly description?: string | null;
  readonly requiresApprovalAbove?: number | null;
}

@Injectable()
export class FeeDiscountService {
  private readonly logger = new Logger(FeeDiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeDiscountRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListFeeDiscountArgs): Promise<{
    readonly items: readonly FeeDiscountRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<FeeDiscountRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new FeeDiscountNotFoundError(id);
    return row;
  }

  public async create(args: CreateFeeDiscountArgs): Promise<FeeDiscountRow> {
    await this.assertModuleEnabled();
    this.validateValue(args.type, args.value);
    this.validateMaxAmount(args.maxAmount ?? null);

    return this.prisma.transaction(async (tx) => {
      const dup = await this.repo.findActiveByCode(args.code, tx);
      if (dup !== null) throw new DuplicateFeeDiscountCodeError(args.code);

      const row = await this.repo.create(
        {
          code: args.code,
          name: args.name,
          type: args.type,
          value: args.value,
          maxAmount: args.maxAmount ?? null,
          appliesToFeeHeadId: args.appliesToFeeHeadId ?? null,
          description: args.description ?? null,
          requiresApprovalAbove: args.requiresApprovalAbove ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.DISCOUNT_CREATED,
        eventType: 'FeeDiscountCreated',
        aggregateType: 'FeeDiscount',
        aggregateId: row.id,
        payload: {
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          value: row.value,
        },
      });

      await this.audit.record(
        {
          action: 'fee_discount.create',
          category: 'finance',
          resourceType: 'FeeDiscount',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeDiscount created id=${row.id} code="${row.code}" type=${row.type}.`,
      );
      return row;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateFeeDiscountArgs,
  ): Promise<FeeDiscountRow> {
    await this.assertModuleEnabled();
    if (args.value !== undefined) {
      const effectiveType = args.type ?? null;
      if (effectiveType !== null) {
        this.validateValue(effectiveType, args.value);
      }
    }
    if (args.maxAmount !== undefined) {
      this.validateMaxAmount(args.maxAmount);
    }

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeDiscountNotFoundError(id);

      if (args.value !== undefined && args.type === undefined) {
        this.validateValue(current.type, args.value);
      }

      if (args.code !== undefined && args.code !== current.code) {
        const dup = await this.repo.findActiveByCode(args.code, tx);
        if (dup !== null && dup.id !== id) {
          throw new DuplicateFeeDiscountCodeError(args.code);
        }
      }

      const patch: Record<string, unknown> = {};
      if (args.code !== undefined) patch.code = args.code;
      if (args.name !== undefined) patch.name = args.name;
      if (args.type !== undefined) patch.type = args.type;
      if (args.value !== undefined) patch.value = args.value;
      if (args.maxAmount !== undefined) patch.maxAmount = args.maxAmount;
      if (args.appliesToFeeHeadId !== undefined) {
        patch.appliesToFeeHeadId = args.appliesToFeeHeadId;
      }
      if (args.description !== undefined) patch.description = args.description;
      if (args.requiresApprovalAbove !== undefined) {
        patch.requiresApprovalAbove = args.requiresApprovalAbove;
      }

      const updated = await this.repo.update(id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.DISCOUNT_UPDATED,
        eventType: 'FeeDiscountUpdated',
        aggregateType: 'FeeDiscount',
        aggregateId: id,
        payload: { id, code: updated.code, type: updated.type },
      });

      await this.audit.record(
        {
          action: 'fee_discount.update',
          category: 'finance',
          resourceType: 'FeeDiscount',
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
      if (current === null) throw new FeeDiscountNotFoundError(id);

      const refs = await this.repo.countActiveStudentAssignments(id, tx);
      if (refs > 0) {
        throw new FeesInUseError('FeeDiscount', id, 'StudentFeeDiscount');
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.DISCOUNT_DELETED,
        eventType: 'FeeDiscountDeleted',
        aggregateType: 'FeeDiscount',
        aggregateId: id,
        payload: { id, code: current.code },
      });

      await this.audit.record(
        {
          action: 'fee_discount.delete',
          category: 'finance',
          resourceType: 'FeeDiscount',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`FeeDiscount soft-deleted id=${id}.`);
    });
  }

  // ---------------------------------------------------------------------
  // Internal validators
  // ---------------------------------------------------------------------

  private validateValue(type: FeeDiscountTypeValue, value: number): void {
    if (!Number.isFinite(value)) {
      throw new DiscountValueInvalidError(`value must be finite; got ${value}`);
    }
    if (value <= 0) {
      throw new DiscountValueInvalidError(`value must be > 0; got ${value}`);
    }
    if (type === 'PERCENT' && value > 100) {
      throw new DiscountValueInvalidError(
        `PERCENT value must be <= 100; got ${value}`,
      );
    }
  }

  private validateMaxAmount(maxAmount: number | null): void {
    if (maxAmount === null) return;
    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      throw new DiscountValueInvalidError(
        `maxAmount must be > 0 when set; got ${maxAmount}`,
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
