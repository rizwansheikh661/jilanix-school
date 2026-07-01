/**
 * Admission DTOs — request / response shapes for the `/admissions`
 * endpoints. The create body carries the full candidate + parent
 * snapshot (one large body — that's the spec); the response includes
 * status, decision metadata, and linkage ids once APPROVED.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';

import {
  ADMISSION_TYPE_VALUES,
  GENDER_VALUES,
  RELIGION_VALUES,
  SOCIAL_CATEGORY_VALUES,
  type AdmissionTypeValue,
  type EmergencyContact,
  type GenderValue,
  type ReligionValue,
  type SocialCategoryValue,
} from '../../student';
import { EmergencyContactDto } from '../../student/student/student.dto';
import {
  ADMISSION_STATUS_VALUES,
  type AdmissionHistoryRow,
  type AdmissionRow,
  type AdmissionStatusValue,
} from '../admission.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const stripDigits = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

const PHONE_REGEX = /^\+?[0-9 ()-]{7,20}$/;
const AADHAAR_REGEX = /^\d{12}$/;
const APAAR_REGEX = /^\d{12}$/;

export class CreateAdmissionDto {
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

  @ApiProperty({ format: 'date' })
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

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly targetAcademicYearId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly targetClassId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly targetSectionId!: string;

  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Optional at DRAFT; required at APPROVE.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  public readonly admissionNo?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  public readonly rollNo?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly fatherName?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly fatherPhone?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly fatherEmail?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly fatherOccupation?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly motherName?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly motherPhone?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly motherEmail?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly motherOccupation?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  public readonly guardianName?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_REGEX)
  public readonly guardianPhone?: string;
  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(255)
  public readonly guardianEmail?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  public readonly guardianOccupation?: string;
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  public readonly guardianRelation?: string;

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

  // ----- Indian-school snapshot (UDISE+/RTE/DBT/DPDP) --------------------
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
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isCwsn?: boolean;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly disabilityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isRte?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isMinority?: boolean;
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly minorityCommunity?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
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

export class UpdateAdmissionDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly targetAcademicYearId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly targetClassId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly targetSectionId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly admissionNo?: string;
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  public readonly rollNo?: string;

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

  // ----- Indian-school snapshot --------------------
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
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isCwsn?: boolean;
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  public readonly disabilityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isRte?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly isMinority?: boolean;
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  public readonly minorityCommunity?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
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

export class AdmissionDecisionDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Optional decision note.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public readonly decisionNote?: string;
}

export class ApproveAdmissionDto extends AdmissionDecisionDto {
  @ApiPropertyOptional({ maxLength: 20, description: 'Override roll-number at approval.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  public readonly rollNo?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  public readonly admittedOn?: string;

  @ApiPropertyOptional({ type: [EmergencyContactDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  public readonly emergencyContacts?: EmergencyContactDto[];
}

export class AdmissionResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ enum: ADMISSION_STATUS_VALUES as unknown as string[] })
  public readonly status!: AdmissionStatusValue;
  @ApiProperty() public readonly firstName!: string;
  @ApiProperty() public readonly lastName!: string;
  @ApiProperty({ format: 'date' }) public readonly dateOfBirth!: string;
  @ApiProperty({ enum: GENDER_VALUES as unknown as string[] }) public readonly gender!: GenderValue;
  @ApiProperty({ nullable: true }) public readonly bloodGroup!: string | null;
  @ApiProperty({ format: 'uuid' }) public readonly targetAcademicYearId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly targetClassId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly targetSectionId!: string;
  @ApiProperty({ nullable: true }) public readonly admissionNo!: string | null;
  @ApiProperty({ nullable: true }) public readonly rollNo!: string | null;
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
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly decidedBy!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' }) public readonly decidedAt!: string | null;
  @ApiProperty({ nullable: true }) public readonly decisionNote!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly studentId!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly parentId!: string | null;

  @ApiProperty({ enum: RELIGION_VALUES as unknown as string[], nullable: true })
  public readonly religion!: ReligionValue | null;
  @ApiProperty({ enum: SOCIAL_CATEGORY_VALUES as unknown as string[], nullable: true })
  public readonly category!: SocialCategoryValue | null;
  @ApiProperty() public readonly nationality!: string;
  @ApiProperty({ nullable: true }) public readonly motherTongue!: string | null;
  @ApiProperty({ nullable: true, description: 'Trailing 4 digits only.' })
  public readonly aadhaarLast4!: string | null;
  @ApiProperty({ nullable: true }) public readonly apaarId!: string | null;
  @ApiProperty() public readonly isCwsn!: boolean;
  @ApiProperty({ nullable: true }) public readonly disabilityType!: string | null;
  @ApiProperty() public readonly isRte!: boolean;
  @ApiProperty() public readonly isMinority!: boolean;
  @ApiProperty({ nullable: true }) public readonly minorityCommunity!: string | null;
  @ApiProperty() public readonly isBpl!: boolean;
  @ApiProperty({ nullable: true }) public readonly previousSchoolName!: string | null;
  @ApiProperty({ nullable: true }) public readonly previousSchoolTcNo!: string | null;
  @ApiProperty({ nullable: true, format: 'date' })
  public readonly previousSchoolTcDate!: string | null;
  @ApiProperty({ enum: ADMISSION_TYPE_VALUES as unknown as string[], nullable: true })
  public readonly admissionType!: AdmissionTypeValue | null;
  @ApiProperty({ nullable: true }) public readonly placeOfBirth!: string | null;
  @ApiProperty({ nullable: true }) public readonly birthCertNo!: string | null;

  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly updatedBy!: string | null;

  public static from(row: AdmissionRow): AdmissionResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: toIsoDate(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup,
      targetAcademicYearId: row.targetAcademicYearId,
      targetClassId: row.targetClassId,
      targetSectionId: row.targetSectionId,
      admissionNo: row.admissionNo,
      rollNo: row.rollNo,
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
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString(),
      decisionNote: row.decisionNote,
      studentId: row.studentId,
      parentId: row.parentId,
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

export class AdmissionListResponseDto {
  @ApiProperty({ type: [AdmissionResponseDto] })
  public readonly items!: readonly AdmissionResponseDto[];
  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class AdmissionHistoryResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly admissionId!: string;
  @ApiProperty({ nullable: true, enum: ADMISSION_STATUS_VALUES as unknown as string[] })
  public readonly fromStatus!: AdmissionStatusValue | null;
  @ApiProperty({ enum: ADMISSION_STATUS_VALUES as unknown as string[] })
  public readonly toStatus!: AdmissionStatusValue;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly actorId!: string | null;
  @ApiProperty({ nullable: true }) public readonly note!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly occurredAt!: string;

  public static from(row: AdmissionHistoryRow): AdmissionHistoryResponseDto {
    return {
      id: row.id,
      admissionId: row.admissionId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      actorId: row.actorId,
      note: row.note,
      occurredAt: row.occurredAt.toISOString(),
    };
  }
}

export class AdmissionHistoryListResponseDto {
  @ApiProperty({ type: [AdmissionHistoryResponseDto] })
  public readonly items!: readonly AdmissionHistoryResponseDto[];
}

export class ApproveAdmissionResponseDto {
  @ApiProperty({ type: AdmissionResponseDto }) public readonly admission!: AdmissionResponseDto;
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly parentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly linkId!: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export { EmergencyContactDto };
export type { EmergencyContact };
