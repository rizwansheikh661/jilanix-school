/**
 * DTOs for `/assignment-submissions` + `/assignment-submissions/:id/attachments`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ATTACHMENT_TYPE_VALUES,
  MAX_MARKS_VALUE,
  REASON_MAX_LENGTH,
  SUBMISSION_STATUS_VALUES,
  type AttachmentTypeValue,
  type SubmissionStatusValue,
} from '../academic-content.constants';
import type {
  AssignmentSubmissionAttachmentRow,
  AssignmentSubmissionRow,
} from '../academic-content.types';

export class SubmissionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly assignmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly studentId?: string;

  @ApiPropertyOptional({ enum: SUBMISSION_STATUS_VALUES })
  @IsOptional() @IsEnum(SUBMISSION_STATUS_VALUES)
  public readonly status?: SubmissionStatusValue;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  public readonly isLate?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  public readonly evaluatedByStaffId?: string;
}

export class CreateSubmissionDto {
  @ApiProperty() @IsUUID()
  public readonly assignmentId!: string;

  @ApiProperty() @IsUUID()
  public readonly studentId!: string;

  @ApiPropertyOptional({ description: 'ISO datetime. Defaults to now.' })
  @IsOptional() @IsISO8601()
  public readonly submittedAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly recordedByStaffId?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  public readonly remarks?: string | null;
}

export class EvaluateSubmissionDto {
  @ApiProperty({ minimum: 0, maximum: MAX_MARKS_VALUE })
  @Type(() => Number) @IsNumber() @Min(0)
  public readonly marksObtained!: number;

  @ApiProperty() @IsUUID()
  public readonly evaluatedByStaffId!: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional() @IsString() @MaxLength(1000)
  public readonly evaluationRemarks?: string | null;
}

export class RejectSubmissionDto {
  @ApiProperty() @IsUUID()
  public readonly evaluatedByStaffId!: string;

  @ApiProperty({ maxLength: REASON_MAX_LENGTH })
  @IsString() @MaxLength(REASON_MAX_LENGTH)
  public readonly rejectionReason!: string;
}

export class SubmissionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly assignmentId!: string;
  @ApiProperty() public readonly studentId!: string;
  @ApiProperty() public readonly submittedAt!: string;
  @ApiProperty() public readonly isLate!: boolean;
  @ApiProperty({ enum: SUBMISSION_STATUS_VALUES })
  public readonly status!: SubmissionStatusValue;
  @ApiPropertyOptional({ nullable: true }) public readonly recordedByStaffId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly remarks!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly marksObtained!: number | null;
  @ApiPropertyOptional({ nullable: true }) public readonly evaluatedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly evaluatedByStaffId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly evaluationRemarks!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly rejectedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly rejectionReason!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: AssignmentSubmissionRow): SubmissionResponseDto {
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      studentId: row.studentId,
      submittedAt: row.submittedAt.toISOString(),
      isLate: row.isLate,
      status: row.status,
      recordedByStaffId: row.recordedByStaffId,
      remarks: row.remarks,
      marksObtained: row.marksObtained,
      evaluatedAt: row.evaluatedAt === null ? null : row.evaluatedAt.toISOString(),
      evaluatedByStaffId: row.evaluatedByStaffId,
      evaluationRemarks: row.evaluationRemarks,
      rejectedAt: row.rejectedAt === null ? null : row.rejectedAt.toISOString(),
      rejectionReason: row.rejectionReason,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class SubmissionListResponseDto {
  @ApiProperty({ type: () => [SubmissionResponseDto] })
  public readonly items!: readonly SubmissionResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

// -------- attachments --------

export class SubmissionAttachmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_TYPE_VALUES })
  @IsOptional() @IsEnum(ATTACHMENT_TYPE_VALUES)
  public readonly attachmentType?: AttachmentTypeValue;
}

export class UploadSubmissionAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_TYPE_VALUES })
  @IsEnum(ATTACHMENT_TYPE_VALUES)
  public readonly attachmentType!: AttachmentTypeValue;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly title!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  public readonly uploadedByStaffId?: string;
}

export class SubmissionAttachmentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly submissionId!: string;
  @ApiProperty() public readonly fileAssetId!: string;
  @ApiProperty({ enum: ATTACHMENT_TYPE_VALUES })
  public readonly attachmentType!: AttachmentTypeValue;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly uploadedByStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(
    row: AssignmentSubmissionAttachmentRow,
  ): SubmissionAttachmentResponseDto {
    return {
      id: row.id,
      submissionId: row.submissionId,
      fileAssetId: row.fileAssetId,
      attachmentType: row.attachmentType,
      title: row.title,
      uploadedByStaffId: row.uploadedByStaffId,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class SubmissionAttachmentListResponseDto {
  @ApiProperty({ type: () => [SubmissionAttachmentResponseDto] })
  public readonly items!: readonly SubmissionAttachmentResponseDto[];
  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
