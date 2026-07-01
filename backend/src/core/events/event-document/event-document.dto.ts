/**
 * DTOs for `/events/{id}/documents` (multipart upload).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EVENT_DOCUMENT_TYPE_VALUES,
  type EventDocumentTypeValue,
} from '../events.constants';
import type { EventDocumentRow } from '../events.types';

export class EventDocumentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EVENT_DOCUMENT_TYPE_VALUES })
  @IsOptional() @IsEnum(EVENT_DOCUMENT_TYPE_VALUES)
  public readonly documentType?: EventDocumentTypeValue;
}

export class UploadEventDocumentDto {
  @ApiProperty({ enum: EVENT_DOCUMENT_TYPE_VALUES })
  @IsEnum(EVENT_DOCUMENT_TYPE_VALUES)
  public readonly documentType!: EventDocumentTypeValue;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly title!: string;

  @ApiPropertyOptional({ maxLength: 10_000, nullable: true })
  @IsOptional() @IsString() @MaxLength(10_000)
  public readonly description?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  public readonly isPublic?: boolean;
}

export class EventDocumentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty() public readonly fileAssetId!: string;
  @ApiProperty({ enum: EVENT_DOCUMENT_TYPE_VALUES })
  public readonly documentType!: EventDocumentTypeValue;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty() public readonly isPublic!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly uploadedBy!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: EventDocumentRow): EventDocumentResponseDto {
    return {
      id: row.id,
      eventId: row.eventId,
      fileAssetId: row.fileAssetId,
      documentType: row.documentType,
      title: row.title,
      description: row.description,
      isPublic: row.isPublic,
      uploadedBy: row.uploadedBy,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class EventDocumentListResponseDto {
  @ApiProperty({ type: () => [EventDocumentResponseDto] })
  public readonly items!: readonly EventDocumentResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
