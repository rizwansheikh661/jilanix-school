import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  SCHOOL_BOARD_VALUES,
  SCHOOL_CATEGORY_VALUES,
  SCHOOL_GENDER_TYPE_VALUES,
  SCHOOL_TYPE_VALUES,
  type SchoolBoardValue,
  type SchoolCategoryValue,
  type SchoolGenderTypeValue,
  type SchoolProfileRow,
  type SchoolTypeValue,
} from '../school.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const CURRENT_YEAR = new Date().getUTCFullYear();

export class UpdateSchoolProfileDto {
  @ApiPropertyOptional({ enum: SCHOOL_BOARD_VALUES, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEnum(SCHOOL_BOARD_VALUES as unknown as object)
  public readonly board?: SchoolBoardValue | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(40)
  public readonly affiliationNumber?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString()
  public readonly affiliationValidTill?: string | null;

  @ApiPropertyOptional({ enum: SCHOOL_TYPE_VALUES })
  @IsOptional() @IsEnum(SCHOOL_TYPE_VALUES as unknown as object)
  public readonly schoolType?: SchoolTypeValue;

  @ApiPropertyOptional({ enum: SCHOOL_CATEGORY_VALUES })
  @IsOptional() @IsEnum(SCHOOL_CATEGORY_VALUES as unknown as object)
  public readonly schoolCategory?: SchoolCategoryValue;

  @ApiPropertyOptional({ enum: SCHOOL_GENDER_TYPE_VALUES })
  @IsOptional() @IsEnum(SCHOOL_GENDER_TYPE_VALUES as unknown as object)
  public readonly genderType?: SchoolGenderTypeValue;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly mediumOfInstruction?: string;

  @ApiPropertyOptional({ minimum: 1800, maximum: CURRENT_YEAR, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(1800) @Max(CURRENT_YEAR)
  public readonly establishedYear?: number | null;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(60)
  public readonly registrationNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(200)
  public readonly trustName?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(120)
  public readonly principalName?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(20)
  public readonly principalPhone?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly principalEmail?: string | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(0)
  public readonly totalAreaSqft?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(0)
  public readonly builtUpAreaSqft?: number | null;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(0)
  public readonly studentCapacity?: number | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255)
  public readonly motto?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString()
  public readonly mission?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString()
  public readonly vision?: string | null;
}

export class SchoolProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ enum: SCHOOL_BOARD_VALUES, nullable: true }) public readonly board!: SchoolBoardValue | null;
  @ApiProperty({ nullable: true }) public readonly affiliationNumber!: string | null;
  @ApiProperty({ format: 'date', nullable: true }) public readonly affiliationValidTill!: string | null;
  @ApiProperty({ enum: SCHOOL_TYPE_VALUES }) public readonly schoolType!: SchoolTypeValue;
  @ApiProperty({ enum: SCHOOL_CATEGORY_VALUES }) public readonly schoolCategory!: SchoolCategoryValue;
  @ApiProperty({ enum: SCHOOL_GENDER_TYPE_VALUES }) public readonly genderType!: SchoolGenderTypeValue;
  @ApiProperty() public readonly mediumOfInstruction!: string;
  @ApiProperty({ nullable: true }) public readonly establishedYear!: number | null;
  @ApiProperty({ nullable: true }) public readonly registrationNumber!: string | null;
  @ApiProperty({ nullable: true }) public readonly trustName!: string | null;
  @ApiProperty({ nullable: true }) public readonly principalName!: string | null;
  @ApiProperty({ nullable: true }) public readonly principalPhone!: string | null;
  @ApiProperty({ nullable: true }) public readonly principalEmail!: string | null;
  @ApiProperty({ nullable: true }) public readonly totalAreaSqft!: number | null;
  @ApiProperty({ nullable: true }) public readonly builtUpAreaSqft!: number | null;
  @ApiProperty({ nullable: true }) public readonly studentCapacity!: number | null;
  @ApiProperty({ nullable: true }) public readonly motto!: string | null;
  @ApiProperty({ nullable: true }) public readonly mission!: string | null;
  @ApiProperty({ nullable: true }) public readonly vision!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;

  public static from(row: SchoolProfileRow): SchoolProfileResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      board: row.board,
      affiliationNumber: row.affiliationNumber,
      affiliationValidTill: row.affiliationValidTill === null ? null : row.affiliationValidTill.toISOString().slice(0, 10),
      schoolType: row.schoolType,
      schoolCategory: row.schoolCategory,
      genderType: row.genderType,
      mediumOfInstruction: row.mediumOfInstruction,
      establishedYear: row.establishedYear,
      registrationNumber: row.registrationNumber,
      trustName: row.trustName,
      principalName: row.principalName,
      principalPhone: row.principalPhone,
      principalEmail: row.principalEmail,
      totalAreaSqft: row.totalAreaSqft,
      builtUpAreaSqft: row.builtUpAreaSqft,
      studentCapacity: row.studentCapacity,
      motto: row.motto,
      mission: row.mission,
      vision: row.vision,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
