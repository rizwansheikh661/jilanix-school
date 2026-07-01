/**
 * Staff DTOs — request / response shapes for `/staff` endpoints. The
 * standard response strips encrypted PII columns and exposes the
 * `_last4` projection. The PII-enriched response (returned by
 * `/staff/:id/pii`, gated by `staff.pii.read`) adds the unmasked
 * Aadhaar / PAN / bank account values.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
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

import { GENDER_VALUES, type GenderValue } from '../../student';
import {
  STAFF_STATUS_VALUES,
  type StaffPiiRow,
  type StaffPublicRow,
  type StaffStatusValue,
} from '../staff.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const stripDigits = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export class CreateStaffDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(100)
  public readonly firstName!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(100)
  public readonly lastName!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateOfBirth?: string;

  @ApiProperty({ enum: GENDER_VALUES as unknown as string[] })
  @IsEnum(GENDER_VALUES as unknown as object)
  public readonly gender!: GenderValue;

  @ApiPropertyOptional({ maxLength: 5 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5)
  public readonly bloodGroup?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly photoUrl?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly email?: string;

  @ApiProperty({ maxLength: 20 })
  @Transform(trim) @IsString() @IsNotEmpty() @Matches(PHONE_REGEX) @MaxLength(20)
  public readonly phone!: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX) @MaxLength(20)
  public readonly alternatePhone?: string;

  @ApiPropertyOptional({ description: '12-digit Aadhaar; stored sealed.' })
  @IsOptional() @Transform(stripDigits) @IsString() @Matches(AADHAAR_REGEX)
  public readonly aadhaar?: string;

  @ApiPropertyOptional({ description: 'PAN (5 letters + 4 digits + 1 letter); stored sealed.' })
  @IsOptional() @Transform(trim) @IsString() @Matches(PAN_REGEX)
  public readonly pan?: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim) @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(200)
  public readonly addressLine1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly addressLine2?: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly city!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly state!: string;

  @ApiProperty({ maxLength: 20 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20)
  public readonly postalCode!: string;

  @ApiPropertyOptional({ maxLength: 80, default: 'IN' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly country?: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  public readonly designation!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly department?: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly dateOfJoining!: string;

  @ApiPropertyOptional({ description: 'Bank account number; stored sealed.' })
  @IsOptional() @Transform(stripDigits) @IsString() @MaxLength(40)
  public readonly bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @Matches(IFSC_REGEX)
  public readonly bankIfsc?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional link to a User row.' })
  @IsOptional() @IsUUID()
  public readonly userId?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  public readonly firstName?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  public readonly lastName?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateOfBirth?: string;
  @ApiPropertyOptional({ enum: GENDER_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(GENDER_VALUES as unknown as object)
  public readonly gender?: GenderValue;
  @ApiPropertyOptional({ maxLength: 5 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5)
  public readonly bloodGroup?: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  public readonly photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly email?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX) @MaxLength(20)
  public readonly phone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX) @MaxLength(20)
  public readonly alternatePhone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(stripDigits) @IsString() @Matches(AADHAAR_REGEX)
  public readonly aadhaar?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PAN_REGEX)
  public readonly pan?: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  public readonly addressLine1?: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly addressLine2?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly city?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80)
  public readonly state?: string;
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20)
  public readonly postalCode?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly country?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  public readonly designation?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly department?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateOfJoining?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly dateOfLeaving?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(stripDigits) @IsString() @MaxLength(40)
  public readonly bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(IFSC_REGEX)
  public readonly bankIfsc?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly userId?: string;
}

export class StaffResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty() public readonly employeeCode!: string;
  @ApiProperty() public readonly firstName!: string;
  @ApiProperty() public readonly lastName!: string;
  @ApiProperty({ nullable: true, format: 'date' }) public readonly dateOfBirth!: string | null;
  @ApiProperty({ enum: GENDER_VALUES as unknown as string[] }) public readonly gender!: GenderValue;
  @ApiProperty({ nullable: true }) public readonly bloodGroup!: string | null;
  @ApiProperty({ nullable: true }) public readonly photoUrl!: string | null;
  @ApiProperty({ nullable: true }) public readonly email!: string | null;
  @ApiProperty() public readonly phone!: string;
  @ApiProperty({ nullable: true }) public readonly alternatePhone!: string | null;
  @ApiProperty({ nullable: true }) public readonly aadhaarLast4!: string | null;
  @ApiProperty({ nullable: true }) public readonly panLast4!: string | null;
  @ApiProperty() public readonly addressLine1!: string;
  @ApiProperty({ nullable: true }) public readonly addressLine2!: string | null;
  @ApiProperty() public readonly city!: string;
  @ApiProperty() public readonly state!: string;
  @ApiProperty() public readonly postalCode!: string;
  @ApiProperty() public readonly country!: string;
  @ApiProperty() public readonly designation!: string;
  @ApiProperty({ nullable: true }) public readonly department!: string | null;
  @ApiProperty({ format: 'date' }) public readonly dateOfJoining!: string;
  @ApiProperty({ nullable: true, format: 'date' }) public readonly dateOfLeaving!: string | null;
  @ApiProperty({ enum: STAFF_STATUS_VALUES as unknown as string[] })
  public readonly status!: StaffStatusValue;
  @ApiProperty({ nullable: true }) public readonly bankAccountLast4!: string | null;
  @ApiProperty({ nullable: true }) public readonly bankIfsc!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly userId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly updatedBy!: string | null;

  public static from(row: StaffPublicRow): StaffResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      employeeCode: row.employeeCode,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth === null ? null : toIsoDate(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup,
      photoUrl: row.photoUrl,
      email: row.email,
      phone: row.phone,
      alternatePhone: row.alternatePhone,
      aadhaarLast4: row.aadhaarLast4,
      panLast4: row.panLast4,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
      designation: row.designation,
      department: row.department,
      dateOfJoining: toIsoDate(row.dateOfJoining),
      dateOfLeaving: row.dateOfLeaving === null ? null : toIsoDate(row.dateOfLeaving),
      status: row.status,
      bankAccountLast4: row.bankAccountLast4,
      bankIfsc: row.bankIfsc,
      userId: row.userId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class StaffListResponseDto {
  @ApiProperty({ type: [StaffResponseDto] })
  public readonly items!: readonly StaffResponseDto[];
  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class StaffPiiResponseDto extends StaffResponseDto {
  @ApiProperty({ nullable: true, description: 'Decrypted Aadhaar; gated by staff.pii.read.' })
  public readonly aadhaar!: string | null;
  @ApiProperty({ nullable: true, description: 'Decrypted PAN; gated by staff.pii.read.' })
  public readonly pan!: string | null;
  @ApiProperty({ nullable: true, description: 'Decrypted bank account; gated by staff.pii.read.' })
  public readonly bankAccount!: string | null;

  public static fromPii(row: StaffPiiRow): StaffPiiResponseDto {
    return {
      ...StaffResponseDto.from(row),
      aadhaar: row.aadhaar,
      pan: row.pan,
      bankAccount: row.bankAccount,
    } as StaffPiiResponseDto;
  }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
