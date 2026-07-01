/**
 * DTOs for the StaffDocument sub-resource.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { StaffDocumentRow } from '../staff.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB metadata cap; upload pipeline ships later

export class CreateStaffDocumentDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(120)
  public readonly label!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(255)
  public readonly fileName!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  public readonly mimeType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_DOCUMENT_BYTES })
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_DOCUMENT_BYTES)
  public readonly sizeBytes!: number;

  @ApiProperty({ maxLength: 1000, description: 'Opaque storage URL.' })
  @Transform(trim) @IsString() @IsUrl({ require_tld: false }) @MaxLength(1000)
  public readonly storageUrl!: string;
}

export class StaffDocumentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty() public readonly label!: string;
  @ApiProperty() public readonly fileName!: string;
  @ApiProperty() public readonly mimeType!: string;
  @ApiProperty() public readonly sizeBytes!: number;
  @ApiProperty() public readonly storageUrl!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly uploadedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly uploadedAt!: string;

  public static from(row: StaffDocumentRow): StaffDocumentResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      label: row.label,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageUrl: row.storageUrl,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }
}

export class StaffDocumentListResponseDto {
  @ApiProperty({ type: [StaffDocumentResponseDto] })
  public readonly items!: readonly StaffDocumentResponseDto[];
}
