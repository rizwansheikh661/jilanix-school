/**
 * HomeworkAttachmentController — `/homework/:homeworkId/attachments` routes
 * (multipart upload + JSON list + soft-delete).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicContentPermissions } from '../academic-content.constants';
import {
  HomeworkAttachmentListQueryDto,
  HomeworkAttachmentListResponseDto,
  HomeworkAttachmentResponseDto,
  UploadHomeworkAttachmentDto,
} from './homework-attachment.dto';
import { HomeworkAttachmentService } from './homework-attachment.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Homework')
@ApiBearerAuth()
@Controller({ path: 'homework/:homeworkId/attachments', version: '1' })
export class HomeworkAttachmentController {
  constructor(private readonly service: HomeworkAttachmentService) {}

  @Get()
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_ATTACHMENT_READ)
  @ApiOperation({ summary: 'List attachments on a homework.' })
  @ApiOkResponse({ type: HomeworkAttachmentListResponseDto })
  public async list(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Query() query: HomeworkAttachmentListQueryDto,
  ): Promise<HomeworkAttachmentListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      homeworkId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.attachmentType !== undefined
        ? { attachmentType: query.attachmentType }
        : {}),
    });
    return {
      items: items.map(HomeworkAttachmentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_ATTACHMENT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        attachmentType: { type: 'string', example: 'PDF' },
        title: { type: 'string', maxLength: 200 },
        uploadedByStaffId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'attachmentType', 'title'],
    },
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: HomeworkAttachmentResponseDto })
  public async upload(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @UploadedFile() file: MulterFile,
    @Body() body: UploadHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentResponseDto> {
    const row = await this.service.upload({
      homeworkId,
      attachmentType: body.attachmentType,
      title: body.title,
      uploadedByStaffId: body.uploadedByStaffId ?? null,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
    });
    return HomeworkAttachmentResponseDto.from(row);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.HOMEWORK_ATTACHMENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete a homework attachment and the underlying FileAsset.',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.delete(homeworkId, attachmentId, parseIfMatch(ifMatch));
  }
}
