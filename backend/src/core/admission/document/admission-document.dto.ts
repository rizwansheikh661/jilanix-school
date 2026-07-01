/**
 * Admission-document DTOs. `storageUrl` is opaque; service does not
 * validate that the URL is reachable (Sprint 3 ships metadata only).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { AdmissionDocumentRow } from '../admission.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** 50 MB hard cap for declared file sizes — matches REST_API_DESIGN. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export class CreateAdmissionDocumentDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  public readonly label!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  public readonly fileName!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public readonly mimeType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_FILE_SIZE_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  public readonly sizeBytes!: number;

  @ApiProperty({ maxLength: 1000, description: 'Opaque storage URL.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  public readonly storageUrl!: string;
}

export class AdmissionDocumentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly admissionId!: string;
  @ApiProperty() public readonly label!: string;
  @ApiProperty() public readonly fileName!: string;
  @ApiProperty() public readonly mimeType!: string;
  @ApiProperty() public readonly sizeBytes!: number;
  @ApiProperty() public readonly storageUrl!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly uploadedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly uploadedAt!: string;

  public static from(row: AdmissionDocumentRow): AdmissionDocumentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      admissionId: row.admissionId,
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

export class AdmissionDocumentListResponseDto {
  @ApiProperty({ type: [AdmissionDocumentResponseDto] })
  public readonly items!: readonly AdmissionDocumentResponseDto[];
}
