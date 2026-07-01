/**
 * AssignmentAttachmentController — `/assignments/:assignmentId/attachments`
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
  AssignmentAttachmentListQueryDto,
  AssignmentAttachmentListResponseDto,
  AssignmentAttachmentResponseDto,
  UploadAssignmentAttachmentDto,
} from './assignment-attachment.dto';
import { AssignmentAttachmentService } from './assignment-attachment.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Assignment')
@ApiBearerAuth()
@Controller({ path: 'assignments/:assignmentId/attachments', version: '1' })
export class AssignmentAttachmentController {
  constructor(private readonly service: AssignmentAttachmentService) {}

  @Get()
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_READ)
  @ApiOperation({ summary: 'List attachments on an assignment.' })
  @ApiOkResponse({ type: AssignmentAttachmentListResponseDto })
  public async list(
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Query() query: AssignmentAttachmentListQueryDto,
  ): Promise<AssignmentAttachmentListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      assignmentId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.attachmentType !== undefined
        ? { attachmentType: query.attachmentType }
        : {}),
    });
    return {
      items: items.map(AssignmentAttachmentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_CREATE)
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
  @ApiCreatedResponse({ type: AssignmentAttachmentResponseDto })
  public async upload(
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @UploadedFile() file: MulterFile,
    @Body() body: UploadAssignmentAttachmentDto,
  ): Promise<AssignmentAttachmentResponseDto> {
    const row = await this.service.upload({
      assignmentId,
      attachmentType: body.attachmentType,
      title: body.title,
      uploadedByStaffId: body.uploadedByStaffId ?? null,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
    });
    return AssignmentAttachmentResponseDto.from(row);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Soft-delete an assignment attachment and the underlying FileAsset.',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.delete(assignmentId, attachmentId, parseIfMatch(ifMatch));
  }
}
