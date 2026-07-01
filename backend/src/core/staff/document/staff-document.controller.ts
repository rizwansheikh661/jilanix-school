/**
 * StaffDocumentController — `/staff/:id/documents`.
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
import { StaffPermissions } from '../staff.constants';
import {
  CreateStaffDocumentDto,
  StaffDocumentListResponseDto,
  StaffDocumentResponseDto,
} from './staff-document.dto';
import { StaffDocumentService } from './staff-document.service';

@ApiTags('StaffDocuments')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/documents', version: '1' })
export class StaffDocumentController {
  constructor(private readonly service: StaffDocumentService) {}

  @Get()
  @RequirePermissions(StaffPermissions.DOCUMENT_READ)
  @ApiOperation({ summary: 'List documents attached to this staff record.' })
  @ApiOkResponse({ type: StaffDocumentListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
  ): Promise<StaffDocumentListResponseDto> {
    const items = await this.service.list(staffId);
    return { items: items.map(StaffDocumentResponseDto.from) };
  }

  @Post()
  @RequirePermissions(StaffPermissions.DOCUMENT_CREATE)
  @ApiOperation({ summary: 'Attach a document to this staff record.' })
  @ApiCreatedResponse({ type: StaffDocumentResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Body() body: CreateStaffDocumentDto,
  ): Promise<StaffDocumentResponseDto> {
    return StaffDocumentResponseDto.from(
      await this.service.create(staffId, {
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
  @RequirePermissions(StaffPermissions.DOCUMENT_DELETE)
  @ApiOperation({ summary: 'Detach a document from this staff record.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<void> {
    await this.service.delete(staffId, documentId);
  }
}
