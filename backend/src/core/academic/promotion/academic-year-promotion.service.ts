/**
 * AcademicYearPromotionService — manages the lifecycle of a year-rollover
 * job record. The bulk-promotion engine itself (move students from year A
 * to year B, mark RETAINED/LEAVERS) lands in Sprint 9; this sprint only
 * ships the state machine + record so the endpoint is stable.
 *
 * Allowed transitions:
 *   PENDING → CANCELLED (via cancel)
 *   PENDING → RUNNING   (job runner — Sprint 9)
 *   RUNNING → COMPLETED | FAILED | CANCELLED (job runner — Sprint 9)
 *
 * `create` enforces source ≠ target and both years must exist in tenant.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import {
  PromotionInvalidStateTransitionError,
  PromotionSameYearError,
} from '../academic.errors';
import type {
  AcademicYearPromotionRow,
  PromotionStatusValue,
} from '../academic.types';
import { AcademicYearPromotionRepository } from '../repositories/academic-year-promotion.repository';
import { AcademicYearRepository } from '../repositories/academic-year.repository';

export interface CreatePromotionArgs {
  readonly sourceAcademicYearId: string;
  readonly targetAcademicYearId: string;
}

export interface ListPromotionsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: PromotionStatusValue;
}

@Injectable()
export class AcademicYearPromotionService {
  private readonly logger = new Logger(AcademicYearPromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AcademicYearPromotionRepository,
    private readonly yearRepo: AcademicYearRepository,
  ) {}

  public async list(args: ListPromotionsArgs): Promise<{
    readonly items: readonly AcademicYearPromotionRow[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AcademicYearPromotionRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('AcademicYearPromotion', id);
    }
    return row;
  }

  public async create(args: CreatePromotionArgs): Promise<AcademicYearPromotionRow> {
    if (args.sourceAcademicYearId === args.targetAcademicYearId) {
      throw new PromotionSameYearError();
    }
    return this.prisma.transaction(async (tx) => {
      const [source, target] = await Promise.all([
        this.yearRepo.findById(args.sourceAcademicYearId, tx),
        this.yearRepo.findById(args.targetAcademicYearId, tx),
      ]);
      if (source === null) {
        throw new NotFoundError('AcademicYear', args.sourceAcademicYearId);
      }
      if (target === null) {
        throw new NotFoundError('AcademicYear', args.targetAcademicYearId);
      }
      const ctx = RequestContextRegistry.require();
      const row = await this.repo.create(
        {
          sourceAcademicYearId: args.sourceAcademicYearId,
          targetAcademicYearId: args.targetAcademicYearId,
          ...(ctx.userId !== undefined ? { triggeredBy: ctx.userId } : {}),
        },
        tx,
      );
      this.logger.log(
        `Scheduled AcademicYearPromotion ${row.id} (${source.name} → ${target.name}).`,
      );
      return row;
    });
  }

  public async cancel(id: string, expectedVersion: number): Promise<AcademicYearPromotionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('AcademicYearPromotion', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('AcademicYearPromotion', id, expectedVersion);
      }
      if (current.status !== 'PENDING' && current.status !== 'RUNNING') {
        throw new PromotionInvalidStateTransitionError({
          promotionId: id,
          currentStatus: current.status,
          attemptedAction: 'cancel',
        });
      }
      const updated = await this.repo.updateStatus(id, expectedVersion, 'CANCELLED', tx);
      this.logger.log(`Cancelled AcademicYearPromotion ${id}.`);
      return updated;
    });
  }
}
