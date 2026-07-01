/**
 * AcademicYearPromotionRepository — read/write access to
 * `academic_year_promotions`. State-machine transitions (PENDING → CANCELLED,
 * etc.) live in the service.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AcademicYearPromotionRow, PromotionStatusValue } from '../academic.types';

export interface CreateAcademicYearPromotionInput {
  readonly sourceAcademicYearId: string;
  readonly targetAcademicYearId: string;
  readonly triggeredBy?: string;
}

export interface ListPromotionsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: PromotionStatusValue;
}

@Injectable()
export class AcademicYearPromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AcademicYearPromotionRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.academicYearPromotion.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListPromotionsArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly AcademicYearPromotionRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const rows = await reader.academicYearPromotion.findMany({
      where: {
        schoolId,
        ...(args.status !== undefined ? { status: args.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? last.id : null;
    return { rows: trimmed.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateAcademicYearPromotionInput,
    tx?: PrismaTx,
  ): Promise<AcademicYearPromotionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.academicYearPromotion.create({
      data: {
        schoolId,
        sourceAcademicYearId: input.sourceAcademicYearId,
        targetAcademicYearId: input.targetAcademicYearId,
        triggeredBy: input.triggeredBy ?? null,
      },
    });
    return mapRow(row);
  }

  public async updateStatus(
    id: string,
    expectedVersion: number,
    status: PromotionStatusValue,
    tx?: PrismaTx,
  ): Promise<AcademicYearPromotionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = {
      status,
      version: { increment: 1 },
    };
    if (status === 'RUNNING') data.startedAt = new Date();
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      data.finishedAt = new Date();
    }
    const result = await writer.academicYearPromotion.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AcademicYearPromotion', id, expectedVersion);
    }
    const row = await writer.academicYearPromotion.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('AcademicYearPromotion', id, expectedVersion);
    }
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error(
        'AcademicYearPromotionRepository requires a tenant-scoped RequestContext.',
      );
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
  status: PromotionStatusValue;
  startedAt: Date | null;
  finishedAt: Date | null;
  summaryJson: unknown;
  triggeredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): AcademicYearPromotionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    sourceAcademicYearId: row.sourceAcademicYearId,
    targetAcademicYearId: row.targetAcademicYearId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    summaryJson: row.summaryJson,
    triggeredBy: row.triggeredBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
