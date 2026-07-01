/**
 * Parent DTOs — request / response shapes for the `/parents` endpoints.
 *
 * Address fields are required at the boundary (DB columns are NOT NULL);
 * country defaults to "IN". Phone/email fields are individually
 * optional, but `ParentService` rejects rows where all three phone
 * slots are empty.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PARENT_RELATION_VALUES,
  type ParentRelationValue,
  type ParentRow,
  type ParentStudentLinkRow,
} from '../parent.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;

export class CreateParentDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  public readonly fatherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_REGEX)
  public readonly fatherPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  public readonly fatherEmail?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  public readonly fatherOccupation?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  public readonly motherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_REGEX)
  public readonly motherPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  public readonly motherEmail?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  public readonly motherOccupation?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  public readonly guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(PHONE_REGEX)
  public readonly guardianPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  public readonly guardianEmail?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  public readonly guardianOccupation?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  public readonly guardianRelation?: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  public readonly addressLine1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  public readonly addressLine2?: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public readonly city!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public readonly state!: string;

  @ApiProperty({ maxLength: 20 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  public readonly postalCode!: string;

  @ApiPropertyOptional({ maxLength: 80, default: 'IN' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  public readonly country?: string;
}

export class UpdateParentDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly fatherName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly fatherPhone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly fatherEmail?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly fatherOccupation?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly motherName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly motherPhone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly motherEmail?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly motherOccupation?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly guardianName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly guardianPhone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly guardianEmail?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly guardianOccupation?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  public readonly guardianRelation?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  public readonly addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly city?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly state?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20)
  public readonly postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly country?: string;
}

export class LinkStudentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly studentId!: string;

  @ApiProperty({ enum: PARENT_RELATION_VALUES as unknown as string[] })
  @IsEnum(PARENT_RELATION_VALUES as unknown as object)
  public readonly relation!: ParentRelationValue;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  public readonly isPrimaryContact?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  public readonly canPickup?: boolean;
}

export class ParentResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ nullable: true }) public readonly fatherName!: string | null;
  @ApiProperty({ nullable: true }) public readonly fatherPhone!: string | null;
  @ApiProperty({ nullable: true }) public readonly fatherEmail!: string | null;
  @ApiProperty({ nullable: true }) public readonly fatherOccupation!: string | null;
  @ApiProperty({ nullable: true }) public readonly motherName!: string | null;
  @ApiProperty({ nullable: true }) public readonly motherPhone!: string | null;
  @ApiProperty({ nullable: true }) public readonly motherEmail!: string | null;
  @ApiProperty({ nullable: true }) public readonly motherOccupation!: string | null;
  @ApiProperty({ nullable: true }) public readonly guardianName!: string | null;
  @ApiProperty({ nullable: true }) public readonly guardianPhone!: string | null;
  @ApiProperty({ nullable: true }) public readonly guardianEmail!: string | null;
  @ApiProperty({ nullable: true }) public readonly guardianOccupation!: string | null;
  @ApiProperty({ nullable: true }) public readonly guardianRelation!: string | null;
  @ApiProperty() public readonly addressLine1!: string;
  @ApiProperty({ nullable: true }) public readonly addressLine2!: string | null;
  @ApiProperty() public readonly city!: string;
  @ApiProperty() public readonly state!: string;
  @ApiProperty() public readonly postalCode!: string;
  @ApiProperty() public readonly country!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly updatedBy!: string | null;

  public static from(row: ParentRow): ParentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      fatherName: row.fatherName,
      fatherPhone: row.fatherPhone,
      fatherEmail: row.fatherEmail,
      fatherOccupation: row.fatherOccupation,
      motherName: row.motherName,
      motherPhone: row.motherPhone,
      motherEmail: row.motherEmail,
      motherOccupation: row.motherOccupation,
      guardianName: row.guardianName,
      guardianPhone: row.guardianPhone,
      guardianEmail: row.guardianEmail,
      guardianOccupation: row.guardianOccupation,
      guardianRelation: row.guardianRelation,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class ParentListResponseDto {
  @ApiProperty({ type: [ParentResponseDto] })
  public readonly items!: readonly ParentResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class ParentStudentLinkResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly parentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ enum: PARENT_RELATION_VALUES as unknown as string[] })
  public readonly relation!: ParentRelationValue;
  @ApiProperty() public readonly isPrimaryContact!: boolean;
  @ApiProperty() public readonly canPickup!: boolean;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;

  public static from(row: ParentStudentLinkRow): ParentStudentLinkResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      parentId: row.parentId,
      studentId: row.studentId,
      relation: row.relation,
      isPrimaryContact: row.isPrimaryContact,
      canPickup: row.canPickup,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    };
  }
}

export class ParentStudentLinkListResponseDto {
  @ApiProperty({ type: [ParentStudentLinkResponseDto] })
  public readonly items!: readonly ParentStudentLinkResponseDto[];
}
