import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';

import type { SchoolBrandingRow } from '../school.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const HEX = /^#[0-9A-F]{6}$/i;

export class UpdateSchoolBrandingDto {
  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @IsUrl({ require_tld: false }) @MaxLength(1000)
  public readonly logoUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @IsUrl({ require_tld: false }) @MaxLength(1000)
  public readonly faviconUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @IsUrl({ require_tld: false }) @MaxLength(1000)
  public readonly letterheadUrl?: string | null;

  @ApiPropertyOptional({ pattern: '^#[0-9A-F]{6}$', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(HEX)
  public readonly brandPrimaryHex?: string | null;

  @ApiPropertyOptional({ pattern: '^#[0-9A-F]{6}$', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(HEX)
  public readonly brandSecondaryHex?: string | null;

  @ApiPropertyOptional({ pattern: '^#[0-9A-F]{6}$', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(HEX)
  public readonly brandAccentHex?: string | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(80)
  public readonly fontFamily?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly tagline?: string | null;
}

export class SchoolBrandingResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ nullable: true }) public readonly logoUrl!: string | null;
  @ApiProperty({ nullable: true }) public readonly faviconUrl!: string | null;
  @ApiProperty({ nullable: true }) public readonly letterheadUrl!: string | null;
  @ApiProperty({ nullable: true }) public readonly brandPrimaryHex!: string | null;
  @ApiProperty({ nullable: true }) public readonly brandSecondaryHex!: string | null;
  @ApiProperty({ nullable: true }) public readonly brandAccentHex!: string | null;
  @ApiProperty({ nullable: true }) public readonly fontFamily!: string | null;
  @ApiProperty({ nullable: true }) public readonly tagline!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: SchoolBrandingRow): SchoolBrandingResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      letterheadUrl: row.letterheadUrl,
      brandPrimaryHex: row.brandPrimaryHex,
      brandSecondaryHex: row.brandSecondaryHex,
      brandAccentHex: row.brandAccentHex,
      fontFamily: row.fontFamily,
      tagline: row.tagline,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
