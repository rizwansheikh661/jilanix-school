/**
 * StudentFeeDiscountService — orchestration for student fee-discount
 * assignment, approval, and unassignment.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { FeesFeatureFlags, FeesOutboxTopics } from '../fees.constants';
import {
  DiscountValueInvalidError,
  FeeDiscountNotFoundError,
  FeesModuleDisabledError,
  StudentFeeDiscountNotFoundError,
} from '../fees.errors';
import type { StudentFeeDiscountRow } from '../fees.types';
import { FeeDiscountRepository } from './fee-discount.repository';
import {
  StudentFeeDiscountRepository,
  type ListStudentFeeDiscountArgs,
} from './student-fee-discount.repository';

export interface CreateStudentFeeDiscountArgs {
  readonly studentId: string;
  readonly feeDiscountId: string;
  readonly academicYearId: string;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
  readonly reason?: string | null;
}

@Injectable()
export class StudentFeeDiscountService {
  private readonly logger = new Logger(StudentFeeDiscountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StudentFeeDiscountRepository,
    private readonly discountRepo: FeeDiscountRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListStudentFeeDiscountArgs): Promise<{
    readonly items: readonly StudentFeeDiscountRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<StudentFeeDiscountRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new StudentFeeDiscountNotFoundError(id);
    return row;
  }

  public async create(
    args: CreateStudentFeeDiscountArgs,
  ): Promise<StudentFeeDiscountRow> {
    await this.assertModuleEnabled();

    if (args.validTo !== undefined && args.validTo !== null) {
      if (args.validFrom.getTime() > args.validTo.getTime()) {
        throw new DiscountValueInvalidError(
          `validFrom (${args.validFrom.toISOString()}) must be <= validTo (${args.validTo.toISOString()})`,
        );
      }
    }

    return this.prisma.transaction(async (tx) => {
      const discount = await this.discountRepo.findById(args.feeDiscountId, tx);
      if (discount === null) {
        throw new FeeDiscountNotFoundError(args.feeDiscountId);
      }

      const row = await this.repo.create(
        {
          studentId: args.studentId,
          feeDiscountId: args.feeDiscountId,
          academicYearId: args.academicYearId,
          validFrom: args.validFrom,
          validTo: args.validTo ?? null,
          reason: args.reason ?? null,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_ASSIGNED,
        eventType: 'StudentFeeDiscountAssigned',
        aggregateType: 'StudentFeeDiscount',
        aggregateId: row.id,
        payload: {
          id: row.id,
          studentId: row.studentId,
          feeDiscountId: row.feeDiscountId,
          academicYearId: row.academicYearId,
        },
      });

      await this.audit.record(
        {
          action: 'student_fee_discount.assign',
          category: 'finance',
          resourceType: 'StudentFeeDiscount',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `StudentFeeDiscount assigned id=${row.id} student=${row.studentId} discount=${row.feeDiscountId}.`,
      );
      return row;
    });
  }

  public async approve(
    id: string,
    expectedVersion: number,
  ): Promise<StudentFeeDiscountRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new StudentFeeDiscountNotFoundError(id);

      const ctx = RequestContextRegistry.require();
      const approvedBy = ctx.userId ?? null;
      const updated = await this.repo.approve(id, expectedVersion, approvedBy, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_APPROVED,
        eventType: 'StudentFeeDiscountApproved',
        aggregateType: 'StudentFeeDiscount',
        aggregateId: id,
        payload: {
          id,
          studentId: updated.studentId,
          feeDiscountId: updated.feeDiscountId,
          approvedBy,
        },
      });

      await this.audit.record(
        {
          action: 'student_fee_discount.approve',
          category: 'finance',
          resourceType: 'StudentFeeDiscount',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`StudentFeeDiscount approved id=${id}.`);
      return updated;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();

    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new StudentFeeDiscountNotFoundError(id);

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.STUDENT_DISCOUNT_UNASSIGNED,
        eventType: 'StudentFeeDiscountUnassigned',
        aggregateType: 'StudentFeeDiscount',
        aggregateId: id,
        payload: {
          id,
          studentId: current.studentId,
          feeDiscountId: current.feeDiscountId,
        },
      });

      await this.audit.record(
        {
          action: 'student_fee_discount.unassign',
          category: 'finance',
          resourceType: 'StudentFeeDiscount',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`StudentFeeDiscount unassigned id=${id}.`);
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
