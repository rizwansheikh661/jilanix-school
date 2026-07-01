/**
 * EventDocumentController — `/events/{id}/documents` routes (multipart).
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
import { EventsPermissions } from '../events.constants';
import {
  EventDocumentListQueryDto,
  EventDocumentListResponseDto,
  EventDocumentResponseDto,
  UploadEventDocumentDto,
} from './event-document.dto';
import { EventDocumentService } from './event-document.service';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events/:eventId/documents', version: '1' })
export class EventDocumentController {
  constructor(private readonly service: EventDocumentService) {}

  @Get()
  @RequirePermissions(EventsPermissions.DOCUMENT_READ)
  @ApiOperation({ summary: 'List documents attached to an event.' })
  @ApiOkResponse({ type: EventDocumentListResponseDto })
  public async list(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Query() query: EventDocumentListQueryDto,
  ): Promise<EventDocumentListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      eventId,
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.documentType !== undefined
        ? { documentType: query.documentType }
        : {}),
    });
    return {
      items: items.map(EventDocumentResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post()
  @RequirePermissions(EventsPermissions.DOCUMENT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', example: 'CIRCULAR' },
        title: { type: 'string', maxLength: 200 },
        description: { type: 'string', nullable: true },
        isPublic: { type: 'boolean', default: false },
      },
      required: ['file', 'documentType', 'title'],
    },
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiCreatedResponse({ type: EventDocumentResponseDto })
  public async upload(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @UploadedFile() file: MulterFile,
    @Body() body: UploadEventDocumentDto,
  ): Promise<EventDocumentResponseDto> {
    const row = await this.service.upload({
      eventId,
      documentType: body.documentType,
      title: body.title,
      description: body.description ?? null,
      isPublic: body.isPublic ?? false,
      fileName: file.originalname,
      mimeType: file.mimetype,
      body: file.buffer,
    });
    return EventDocumentResponseDto.from(row);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(EventsPermissions.DOCUMENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete a document and best-effort soft-delete the FileAsset.',
  })
  @ApiNoContentResponse()
  public async remove(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    await this.service.delete(eventId, documentId, parseIfMatch(ifMatch));
  }
}
