/**
 * DTOs for `/assignments/{assignmentId}/attachments` (multipart upload).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ATTACHMENT_TYPE_VALUES,
  type AttachmentTypeValue,
} from '../academic-content.constants';
import type { AssignmentAttachmentRow } from '../academic-content.types';

export class AssignmentAttachmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_TYPE_VALUES })
  @IsOptional() @IsEnum(ATTACHMENT_TYPE_VALUES)
  public readonly attachmentType?: AttachmentTypeValue;
}

export class UploadAssignmentAttachmentDto {
  @ApiProperty({ enum: ATTACHMENT_TYPE_VALUES })
  @IsEnum(ATTACHMENT_TYPE_VALUES)
  public readonly attachmentType!: AttachmentTypeValue;

  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200)
  public readonly title!: string;

  @ApiPropertyOptional({ description: 'Optional staff id of the uploader.' })
  @IsOptional() @IsUUID()
  public readonly uploadedByStaffId?: string;
}

export class AssignmentAttachmentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly assignmentId!: string;
  @ApiProperty() public readonly fileAssetId!: string;
  @ApiProperty({ enum: ATTACHMENT_TYPE_VALUES })
  public readonly attachmentType!: AttachmentTypeValue;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly uploadedByStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: AssignmentAttachmentRow): AssignmentAttachmentResponseDto {
    return {
      id: row.id,
      assignmentId: row.assignmentId,
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

export class AssignmentAttachmentListResponseDto {
  @ApiProperty({ type: () => [AssignmentAttachmentResponseDto] })
  public readonly items!: readonly AssignmentAttachmentResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
