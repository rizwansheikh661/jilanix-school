/**
 * AcademicYearPromotion DTOs — request/response shapes for the
 * `/promotions` routes. The schema-only Sprint 4 endpoint accepts the
 * source/target year ids; the actual student-movement engine is Sprint 9.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import {
  PROMOTION_STATUS_VALUES,
  type AcademicYearPromotionRow,
  type PromotionStatusValue,
} from '../academic.types';

export class CreateAcademicYearPromotionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sourceAcademicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly targetAcademicYearId!: string;
}

export class ListPromotionsQueryDto {
  @ApiPropertyOptional({ enum: PROMOTION_STATUS_VALUES as unknown as string[] })
  @IsOptional()
  @IsEnum(PROMOTION_STATUS_VALUES as unknown as readonly string[])
  public readonly status?: PromotionStatusValue;
}

export class AcademicYearPromotionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly sourceAcademicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly targetAcademicYearId!: string;

  @ApiProperty({ enum: PROMOTION_STATUS_VALUES as unknown as string[] })
  public readonly status!: PromotionStatusValue;

  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly startedAt!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly finishedAt!: string | null;

  @ApiProperty({ nullable: true, description: 'Summary totals — populated when COMPLETED.' })
  public readonly summary!: unknown;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly triggeredBy!: string | null;

  @ApiProperty()
  public readonly version!: number;

  @ApiProperty({ format: 'date-time' })
  public readonly createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly createdBy!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly updatedBy!: string | null;

  public static from(row: AcademicYearPromotionRow): AcademicYearPromotionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      sourceAcademicYearId: row.sourceAcademicYearId,
      targetAcademicYearId: row.targetAcademicYearId,
      status: row.status,
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
      summary: row.summaryJson,
      triggeredBy: row.triggeredBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class AcademicYearPromotionListResponseDto {
  @ApiProperty({ type: [AcademicYearPromotionResponseDto] })
  public readonly items!: readonly AcademicYearPromotionResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}
