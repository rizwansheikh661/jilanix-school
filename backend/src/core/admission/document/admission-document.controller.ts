/**
 * AdmissionDocumentController — HTTP routes nested under
 * `/api/v1/admissions/:id/documents`. Metadata-only; the storage URL is
 * an opaque string.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { AdmissionPermissions } from '../admission.constants';
import {
  AdmissionDocumentListResponseDto,
  AdmissionDocumentResponseDto,
  CreateAdmissionDocumentDto,
} from './admission-document.dto';
import { AdmissionDocumentService } from './admission-document.service';

@ApiTags('AdmissionDocuments')
@ApiBearerAuth()
@Controller({ path: 'admissions/:id/documents', version: '1' })
export class AdmissionDocumentController {
  constructor(private readonly service: AdmissionDocumentService) {}

  @Get()
  @RequirePermissions(AdmissionPermissions.DOCUMENT_READ)
  @ApiOperation({ summary: 'List documents attached to this admission.' })
  @ApiOkResponse({ type: AdmissionDocumentListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) admissionId: string,
  ): Promise<AdmissionDocumentListResponseDto> {
    const items = await this.service.list(admissionId);
    return { items: items.map(AdmissionDocumentResponseDto.from) };
  }

  @Post()
  @RequirePermissions(AdmissionPermissions.DOCUMENT_CREATE)
  @ApiOperation({ summary: 'Attach a document to this admission.' })
  @ApiCreatedResponse({ type: AdmissionDocumentResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('id', new ParseUUIDPipe()) admissionId: string,
    @Body() body: CreateAdmissionDocumentDto,
  ): Promise<AdmissionDocumentResponseDto> {
    return AdmissionDocumentResponseDto.from(
      await this.service.create(admissionId, {
        label: body.label,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        storageUrl: body.storageUrl,
      }),
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AdmissionPermissions.DOCUMENT_DELETE)
  @ApiOperation({ summary: 'Detach a document from this admission.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) admissionId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<void> {
    await this.service.delete(admissionId, documentId);
  }
}
