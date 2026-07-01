import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  SCHOOL_DOCUMENT_TYPE_VALUES,
  type SchoolDocumentRow,
  type SchoolDocumentTypeValue,
} from '../school.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export class CreateSchoolDocumentDto {
  @ApiProperty({ enum: SCHOOL_DOCUMENT_TYPE_VALUES })
  @IsEnum(SCHOOL_DOCUMENT_TYPE_VALUES as unknown as object)
  public readonly documentType!: SchoolDocumentTypeValue;

  @ApiProperty({ maxLength: 120 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  public readonly label!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(255)
  public readonly fileName!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @MaxLength(100)
  public readonly mimeType!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_DOCUMENT_BYTES })
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_DOCUMENT_BYTES)
  public readonly sizeBytes!: number;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim) @IsString() @IsUrl({ require_tld: false }) @MaxLength(1000)
  public readonly storageUrl!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  public readonly issueDate?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  public readonly expiryDate?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(200)
  public readonly issuingAuthority?: string | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(80)
  public readonly docNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  public readonly notes?: string | null;
}

export class SchoolDocumentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ enum: SCHOOL_DOCUMENT_TYPE_VALUES }) public readonly documentType!: SchoolDocumentTypeValue;
  @ApiProperty() public readonly label!: string;
  @ApiProperty() public readonly fileName!: string;
  @ApiProperty() public readonly mimeType!: string;
  @ApiProperty() public readonly sizeBytes!: number;
  @ApiProperty() public readonly storageUrl!: string;
  @ApiProperty({ format: 'date', nullable: true }) public readonly issueDate!: string | null;
  @ApiProperty({ format: 'date', nullable: true }) public readonly expiryDate!: string | null;
  @ApiProperty({ nullable: true }) public readonly issuingAuthority!: string | null;
  @ApiProperty({ nullable: true }) public readonly docNumber!: string | null;
  @ApiProperty({ nullable: true }) public readonly notes!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) public readonly uploadedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly uploadedAt!: string;

  public static from(row: SchoolDocumentRow): SchoolDocumentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      documentType: row.documentType,
      label: row.label,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageUrl: row.storageUrl,
      issueDate: row.issueDate === null ? null : row.issueDate.toISOString().slice(0, 10),
      expiryDate: row.expiryDate === null ? null : row.expiryDate.toISOString().slice(0, 10),
      issuingAuthority: row.issuingAuthority,
      docNumber: row.docNumber,
      notes: row.notes,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }
}

export class SchoolDocumentListResponseDto {
  @ApiProperty({ type: [SchoolDocumentResponseDto] })
  public readonly items!: readonly SchoolDocumentResponseDto[];
}
