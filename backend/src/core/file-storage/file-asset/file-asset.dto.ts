import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type {
  FileAssetAclGrantRow,
  FileAssetRow,
  FilePurpose,
  FileScanStatus,
} from '../file-storage.types';

export const FilePurposeValues = [
  'STUDENT_PHOTO',
  'STAFF_PHOTO',
  'ADMISSION_DOCUMENT',
  'SCHOOL_DOCUMENT',
  'SCHOOL_LOGO',
  'MESSAGE_ATTACHMENT',
  'REPORT_EXPORT',
  'BULK_IMPORT',
  'OTHER',
] as const;

export class FileAssetListQueryDto {
  @ApiPropertyOptional({ enum: FilePurposeValues })
  @IsOptional()
  @IsEnum(FilePurposeValues)
  public readonly purpose?: FilePurpose;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public readonly limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;
}

export class UploadFileMetadataDto {
  @ApiProperty({ enum: FilePurposeValues })
  @IsEnum(FilePurposeValues)
  public readonly purpose!: FilePurpose;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  public readonly isPublic?: boolean;
}

export class GrantAclDto {
  @ApiProperty({ enum: ['USER', 'ROLE', 'PUBLIC'] })
  @IsEnum(['USER', 'ROLE', 'PUBLIC'])
  public readonly principalType!: 'USER' | 'ROLE' | 'PUBLIC';

  @ApiPropertyOptional({ description: 'Required when principalType ≠ PUBLIC.' })
  @IsOptional()
  @IsUUID('4')
  public readonly principalId?: string;
}

export class FileAssetResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty({ nullable: true }) public readonly schoolId!: string | null;
  @ApiProperty({ enum: FilePurposeValues }) public readonly purpose!: FilePurpose;
  @ApiProperty() public readonly fileName!: string;
  @ApiProperty() public readonly mimeType!: string;
  @ApiProperty() public readonly sizeBytes!: string;
  @ApiProperty() public readonly checksumSha256!: string;
  @ApiProperty() public readonly isPublic!: boolean;
  @ApiProperty({ enum: ['PENDING', 'CLEAN', 'INFECTED', 'SCAN_FAILED'] })
  public readonly scanStatus!: FileScanStatus;
  @ApiProperty({ nullable: true }) public readonly ownerUserId!: string | null;
  @ApiProperty({ nullable: true }) public readonly expiresAt!: string | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiProperty() public readonly version!: number;

  public static from(row: FileAssetRow): FileAssetResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      purpose: row.purpose,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes.toString(),
      checksumSha256: row.checksumSha256,
      isPublic: row.isPublic,
      scanStatus: row.scanStatus,
      ownerUserId: row.ownerUserId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  }
}

export class FileAssetListResponseDto {
  @ApiProperty({ type: [FileAssetResponseDto] })
  public readonly items!: readonly FileAssetResponseDto[];
  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class FileDownloadUrlResponseDto {
  @ApiProperty() public readonly url!: string;
  @ApiProperty() public readonly expiresInSeconds!: number;
}

export class AclGrantResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly fileAssetId!: string;
  @ApiProperty({ enum: ['USER', 'ROLE', 'PUBLIC'] })
  public readonly principalType!: 'USER' | 'ROLE' | 'PUBLIC';
  @ApiProperty({ nullable: true }) public readonly principalId!: string | null;
  @ApiProperty() public readonly grantedAt!: string;
  @ApiProperty({ nullable: true }) public readonly revokedAt!: string | null;
  @ApiProperty() public readonly version!: number;

  public static from(row: FileAssetAclGrantRow): AclGrantResponseDto {
    return {
      id: row.id,
      fileAssetId: row.fileAssetId,
      principalType: row.principalType,
      principalId: row.principalId,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      version: row.version,
    };
  }
}
