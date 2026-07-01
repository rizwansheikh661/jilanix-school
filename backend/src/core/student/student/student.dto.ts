/**
 * Student DTOs — request / response shapes for the `/students` endpoints.
 *
 * Identifiers (admissionNo, rollNo) are trimmed at the boundary so the
 * uniqueness checks see canonical values; phone numbers in
 * EmergencyContactDto follow the lenient REST_API_DESIGN regex.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ADMISSION_TYPE_VALUES,
  GENDER_VALUES,
  RELIGION_VALUES,
  SOCIAL_CATEGORY_VALUES,
  STUDENT_STATUS_VALUES,
  type AdmissionTypeValue,
  type EmergencyContact,
  type GenderValue,
  type ReligionValue,
  type SocialCategoryValue,
  type StudentRow,
  type StudentStatusValue,
} from '../student.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const stripDigits = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const APAAR_REGEX = /^\d{12}$/;

export class EmergencyContactDto implements EmergencyContact {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  public readonly name!: string;

  @ApiProperty({ description: 'E.164 / display phone (7..20 chars).' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX)
  public readonly phone!: string;

  @ApiProperty({ description: 'E.g. "Father", "Aunt".', maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  public readonly relation!: string;
}

export class CreateStudentDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  public readonly firstName!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  public readonly lastName!: string;

  @ApiProperty({ format: 'date', description: 'ISO date (YYYY-MM-DD).' })
  @IsDateString()
  public readonly dateOfBirth!: string;

  @ApiProperty({ enum: GENDER_VALUES as unknown as string[] })
  @IsEnum(GENDER_VALUES as unknown as object)
  public readonly gender!: GenderValue;

  @ApiPropertyOptional({ maxLength: 5 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5)
  public readonly bloodGroup?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public readonly photoUrl?: string;

  @ApiProperty({ maxLength: 80, description: 'Unique per school.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public readonly admissionNo!: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  public readonly rollNo?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly academicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly classId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly sectionId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  public readonly admittedOn!: string;

  @ApiPropertyOptional({ enum: STUDENT_STATUS_VALUES as unknown as string[], default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(STUDENT_STATUS_VALUES as unknown as object)
  public readonly status?: StudentStatusValue;

  @ApiProperty({ type: [EmergencyContactDto], description: 'Up to 5 contacts.' })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  public readonly emergencyContacts!: EmergencyContactDto[];

  // -----------------------------------------------------------------------
  // Indian-school compliance fields (UDISE+, RTE §12(1)(c), DBT, DPDP).
  // -----------------------------------------------------------------------
  @ApiPropertyOptional({ enum: RELIGION_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(RELIGION_VALUES as unknown as object)
  public readonly religion?: ReligionValue;

  @ApiPropertyOptional({ enum: SOCIAL_CATEGORY_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(SOCIAL_CATEGORY_VALUES as unknown as object)
  public readonly category?: SocialCategoryValue;

  @ApiPropertyOptional({ maxLength: 80, default: 'Indian' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly nationality?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly motherTongue?: string;

  @ApiPropertyOptional({ description: '12-digit Aadhaar; stored sealed.' })
  @IsOptional() @Transform(stripDigits) @IsString() @Matches(AADHAAR_REGEX)
  public readonly aadhaar?: string;

  @ApiPropertyOptional({ description: '12-digit APAAR ID.' })
  @IsOptional() @Transform(stripDigits) @IsString() @Matches(APAAR_REGEX)
  public readonly apaarId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isCwsn?: boolean;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly disabilityType?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isRte?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isMinority?: boolean;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly minorityCommunity?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isBpl?: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly previousSchoolName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly previousSchoolTcNo?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly previousSchoolTcDate?: string;

  @ApiPropertyOptional({ enum: ADMISSION_TYPE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ADMISSION_TYPE_VALUES as unknown as object)
  public readonly admissionType?: AdmissionTypeValue;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  public readonly placeOfBirth?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  public readonly birthCertNo?: string;
}

export class UpdateStudentDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public readonly firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public readonly lastName?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  public readonly dateOfBirth?: string;

  @ApiPropertyOptional({ enum: GENDER_VALUES as unknown as string[] })
  @IsOptional()
  @IsEnum(GENDER_VALUES as unknown as object)
  public readonly gender?: GenderValue;

  @ApiPropertyOptional({ maxLength: 5, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5)
  public readonly bloodGroup?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public readonly photoUrl?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly classId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly sectionId?: string;

  @ApiPropertyOptional({ type: [EmergencyContactDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  public readonly emergencyContacts?: EmergencyContactDto[];

  @ApiPropertyOptional({ enum: RELIGION_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(RELIGION_VALUES as unknown as object)
  public readonly religion?: ReligionValue;
  @ApiPropertyOptional({ enum: SOCIAL_CATEGORY_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(SOCIAL_CATEGORY_VALUES as unknown as object)
  public readonly category?: SocialCategoryValue;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly nationality?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly motherTongue?: string;
  @ApiPropertyOptional({ description: '12-digit Aadhaar; stored sealed.' })
  @IsOptional() @Transform(stripDigits) @IsString() @Matches(AADHAAR_REGEX)
  public readonly aadhaar?: string;
  @ApiPropertyOptional({ description: '12-digit APAAR ID.' })
  @IsOptional() @Transform(stripDigits) @IsString() @Matches(APAAR_REGEX)
  public readonly apaarId?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isCwsn?: boolean;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly disabilityType?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isRte?: boolean;
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isMinority?: boolean;
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly minorityCommunity?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isBpl?: boolean;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly previousSchoolName?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly previousSchoolTcNo?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional() @IsDateString()
  public readonly previousSchoolTcDate?: string;
  @ApiPropertyOptional({ enum: ADMISSION_TYPE_VALUES as unknown as string[] })
  @IsOptional() @IsEnum(ADMISSION_TYPE_VALUES as unknown as object)
  public readonly admissionType?: AdmissionTypeValue;
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120)
  public readonly placeOfBirth?: string;
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  public readonly birthCertNo?: string;
}

export class AssignRollDto {
  @ApiPropertyOptional({
    maxLength: 20,
    nullable: true,
    description: 'Roll number; null/empty unassigns.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  public readonly rollNo?: string | null;
}

export class StudentResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly schoolId!: string;

  @ApiProperty()
  public readonly firstName!: string;

  @ApiProperty()
  public readonly lastName!: string;

  @ApiProperty({ format: 'date' })
  public readonly dateOfBirth!: string;

  @ApiProperty({ enum: GENDER_VALUES as unknown as string[] })
  public readonly gender!: GenderValue;

  @ApiProperty({ nullable: true })
  public readonly bloodGroup!: string | null;

  @ApiProperty({ nullable: true })
  public readonly photoUrl!: string | null;

  @ApiProperty()
  public readonly admissionNo!: string;

  @ApiProperty({ nullable: true })
  public readonly rollNo!: string | null;

  @ApiProperty({ format: 'uuid' })
  public readonly academicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly classId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly sectionId!: string;

  @ApiProperty({ enum: STUDENT_STATUS_VALUES as unknown as string[] })
  public readonly status!: StudentStatusValue;

  @ApiProperty({ format: 'date' })
  public readonly admittedOn!: string;

  @ApiProperty({ type: [EmergencyContactDto] })
  public readonly emergencyContacts!: readonly EmergencyContact[];

  @ApiProperty({ enum: RELIGION_VALUES as unknown as string[], nullable: true })
  public readonly religion!: ReligionValue | null;

  @ApiProperty({ enum: SOCIAL_CATEGORY_VALUES as unknown as string[], nullable: true })
  public readonly category!: SocialCategoryValue | null;

  @ApiProperty()
  public readonly nationality!: string;

  @ApiProperty({ nullable: true })
  public readonly motherTongue!: string | null;

  @ApiProperty({ nullable: true, description: 'Trailing 4 digits of Aadhaar; full value never returned.' })
  public readonly aadhaarLast4!: string | null;

  @ApiProperty({ nullable: true })
  public readonly apaarId!: string | null;

  @ApiProperty()
  public readonly isCwsn!: boolean;

  @ApiProperty({ nullable: true })
  public readonly disabilityType!: string | null;

  @ApiProperty()
  public readonly isRte!: boolean;

  @ApiProperty()
  public readonly isMinority!: boolean;

  @ApiProperty({ nullable: true })
  public readonly minorityCommunity!: string | null;

  @ApiProperty()
  public readonly isBpl!: boolean;

  @ApiProperty({ nullable: true })
  public readonly previousSchoolName!: string | null;

  @ApiProperty({ nullable: true })
  public readonly previousSchoolTcNo!: string | null;

  @ApiProperty({ nullable: true, format: 'date' })
  public readonly previousSchoolTcDate!: string | null;

  @ApiProperty({ enum: ADMISSION_TYPE_VALUES as unknown as string[], nullable: true })
  public readonly admissionType!: AdmissionTypeValue | null;

  @ApiProperty({ nullable: true })
  public readonly placeOfBirth!: string | null;

  @ApiProperty({ nullable: true })
  public readonly birthCertNo!: string | null;

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

  public static from(row: StudentRow): StudentResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: toIsoDate(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup,
      photoUrl: row.photoUrl,
      admissionNo: row.admissionNo,
      rollNo: row.rollNo,
      academicYearId: row.academicYearId,
      classId: row.classId,
      sectionId: row.sectionId,
      status: row.status,
      admittedOn: toIsoDate(row.admittedOn),
      emergencyContacts: row.emergencyContacts,
      religion: row.religion,
      category: row.category,
      nationality: row.nationality,
      motherTongue: row.motherTongue,
      aadhaarLast4: row.aadhaarLast4,
      apaarId: row.apaarId,
      isCwsn: row.isCwsn,
      disabilityType: row.disabilityType,
      isRte: row.isRte,
      isMinority: row.isMinority,
      minorityCommunity: row.minorityCommunity,
      isBpl: row.isBpl,
      previousSchoolName: row.previousSchoolName,
      previousSchoolTcNo: row.previousSchoolTcNo,
      previousSchoolTcDate:
        row.previousSchoolTcDate === null ? null : toIsoDate(row.previousSchoolTcDate),
      admissionType: row.admissionType,
      placeOfBirth: row.placeOfBirth,
      birthCertNo: row.birthCertNo,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class StudentListResponseDto {
  @ApiProperty({ type: [StudentResponseDto] })
  public readonly items!: readonly StudentResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
