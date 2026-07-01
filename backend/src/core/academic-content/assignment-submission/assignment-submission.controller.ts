/**
 * AssignmentSubmissionController — `/assignment-submissions` lifecycle +
 * `/assignment-submissions/:submissionId/attachments` nested resource.
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicContentPermissions } from '../academic-content.constants';
import {
  CreateSubmissionDto,
  EvaluateSubmissionDto,
  RejectSubmissionDto,
  SubmissionAttachmentListQueryDto,
  SubmissionAttachmentListResponseDto,
  SubmissionAttachmentResponseDto,
  SubmissionListQueryDto,
  SubmissionListResponseDto,
  SubmissionResponseDto,
  UploadSubmissionAttachmentDto,
} from './assignment-submission.dto';
import { AssignmentSubmissionAttachmentService } from './assignment-submission-attachment.service';
import { AssignmentSubmissionService } from './assignment-submission.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('AssignmentSubmission')
@ApiBearerAuth()
@Controller({ path: 'assignment-submissions', version: '1' })
export class AssignmentSubmissionController {
  constructor(
    private readonly service: AssignmentSubmissionService,
    private readonly attachmentService: AssignmentSubmissionAttachmentService,
  ) {}

  @Get()
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_READ)
  @ApiOperation({ summary: 'List submissions (cursor paginated).' })
  @ApiOkResponse({ type: SubmissionListResponseDto })
  public async list(
    @Query() query: SubmissionListQueryDto,
  ): Promise<SubmissionListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.assignmentId !== undefined
        ? { assignmentId: query.assignmentId }
        : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.isLate !== undefined ? { isLate: query.isLate } : {}),
      ...(query.evaluatedByStaffId !== undefined
        ? { evaluatedByStaffId: query.evaluatedByStaffId }
        : {}),
    });
    return {
      items: items.map(SubmissionResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_READ)
  @ApiOperation({ summary: 'Get a submission by id.' })
  @ApiOkResponse({ type: SubmissionResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SubmissionResponseDto> {
    return SubmissionResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_CREATE)
  @ApiOperation({
    summary:
      'Record a submission on behalf of a student (teacher-mediated only in v1).',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: SubmissionResponseDto })
  public async create(
    @Body() body: CreateSubmissionDto,
  ): Promise<SubmissionResponseDto> {
    const { submission } = await this.service.submit({
      assignmentId: body.assignmentId,
      studentId: body.studentId,
      ...(body.submittedAt !== undefined
        ? { submittedAt: new Date(body.submittedAt) }
        : {}),
      ...(body.recordedByStaffId !== undefined
        ? { recordedByStaffId: body.recordedByStaffId }
        : {}),
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
    });
    return SubmissionResponseDto.from(submission);
  }

  @Post(':id/evaluate')
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_EVALUATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Evaluate a submission with marks. Transition → EVALUATED.',
  })
  @ApiOkResponse({ type: SubmissionResponseDto })
  public async evaluate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: EvaluateSubmissionDto,
  ): Promise<SubmissionResponseDto> {
    const row = await this.service.evaluate(id, parseIfMatch(ifMatch), {
      marksObtained: body.marksObtained,
      evaluatedByStaffId: body.evaluatedByStaffId,
      ...(body.evaluationRemarks !== undefined
        ? { evaluationRemarks: body.evaluationRemarks }
        : {}),
    });
    return SubmissionResponseDto.from(row);
  }

  @Post(':id/reject')
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_REJECT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a submission. Transition → REJECTED.' })
  @ApiOkResponse({ type: SubmissionResponseDto })
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectSubmissionDto,
  ): Promise<SubmissionResponseDto> {
    const row = await this.service.reject(id, parseIfMatch(ifMatch), {
      evaluatedByStaffId: body.evaluatedByStaffId,
      rejectionReason: body.rejectionReason,
    });
    return SubmissionResponseDto.from(row);
  }

  // ----- attachments -----

  @Get(':submissionId/attachments')
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_READ)
  @ApiOperation({ summary: 'List attachments on a submission.' })
  @ApiOkResponse({ type: SubmissionAttachmentListResponseDto })
  public async listAttachments(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Query() query: SubmissionAttachmentListQueryDto,
  ): Promise<SubmissionAttachmentListResponseDto> {
    const { items, nextCursorId } = await this.attachmentService.list({
      submissionId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.attachmentType !== undefined
        ? { attachmentType: query.attachmentType }
        : {}),
    });
    return {
      items: items.map(SubmissionAttachmentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post(':submissionId/attachments')
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_CREATE)
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
  @ApiCreatedResponse({ type: SubmissionAttachmentResponseDto })
  public async uploadAttachment(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @UploadedFile() file: MulterFile,
    @Body() body: UploadSubmissionAttachmentDto,
  ): Promise<SubmissionAttachmentResponseDto> {
    const row = await this.attachmentService.upload({
      submissionId,
      attachmentType: body.attachmentType,
      title: body.title,
      uploadedByStaffId: body.uploadedByStaffId ?? null,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
    });
    return SubmissionAttachmentResponseDto.from(row);
  }

  @Delete(':submissionId/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicContentPermissions.SUBMISSION_CREATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete a submission attachment and the underlying FileAsset.',
  })
  @ApiNoContentResponse()
  public async deleteAttachment(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.attachmentService.delete(
      submissionId,
      attachmentId,
      parseIfMatch(ifMatch),
    );
  }
}
