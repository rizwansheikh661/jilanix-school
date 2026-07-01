/**
 * DTOs for `/homework/{homeworkId}/attachments` (multipart upload).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  ATTACHMENT_TYPE_VALUES,
  type AttachmentTypeValue,
} from '../academic-content.constants';
import type { HomeworkAttachmentRow } from '../academic-content.types';

export class HomeworkAttachmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ATTACHMENT_TYPE_VALUES })
  @IsOptional() @IsEnum(ATTACHMENT_TYPE_VALUES)
  public readonly attachmentType?: AttachmentTypeValue;
}

export class UploadHomeworkAttachmentDto {
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

export class HomeworkAttachmentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly homeworkId!: string;
  @ApiProperty() public readonly fileAssetId!: string;
  @ApiProperty({ enum: ATTACHMENT_TYPE_VALUES })
  public readonly attachmentType!: AttachmentTypeValue;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly uploadedByStaffId!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: HomeworkAttachmentRow): HomeworkAttachmentResponseDto {
    return {
      id: row.id,
      homeworkId: row.homeworkId,
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

export class HomeworkAttachmentListResponseDto {
  @ApiProperty({ type: () => [HomeworkAttachmentResponseDto] })
  public readonly items!: readonly HomeworkAttachmentResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}
