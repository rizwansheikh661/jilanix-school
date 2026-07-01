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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { RequirePermissions } from '../../rbac';
import { SchoolPermissions } from '../school.constants';
import {
  SCHOOL_DOCUMENT_TYPE_VALUES,
  type SchoolDocumentTypeValue,
} from '../school.types';
import {
  CreateSchoolDocumentDto,
  SchoolDocumentListResponseDto,
  SchoolDocumentResponseDto,
} from './school-document.dto';
import { SchoolDocumentService } from './school-document.service';

class SchoolDocumentListQueryDto {
  @IsOptional() @IsEnum(SCHOOL_DOCUMENT_TYPE_VALUES as unknown as object)
  public readonly documentType?: SchoolDocumentTypeValue;
}

@ApiTags('SchoolDocuments')
@ApiBearerAuth()
@Controller({ path: 'school/documents', version: '1' })
export class SchoolDocumentController {
  constructor(private readonly service: SchoolDocumentService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.DOCUMENT_READ)
  @ApiOperation({ summary: 'List school documents (metadata).' })
  @ApiQuery({ name: 'documentType', required: false, enum: SCHOOL_DOCUMENT_TYPE_VALUES })
  @ApiOkResponse({ type: SchoolDocumentListResponseDto })
  public async list(
    @Query() query: SchoolDocumentListQueryDto,
  ): Promise<SchoolDocumentListResponseDto> {
    const items = await this.service.list({ documentType: query.documentType });
    return { items: items.map(SchoolDocumentResponseDto.from) };
  }

  @Post()
  @RequirePermissions(SchoolPermissions.DOCUMENT_CREATE)
  @ApiOperation({ summary: 'Attach a document to the school.' })
  @ApiCreatedResponse({ type: SchoolDocumentResponseDto })
  public async create(@Body() body: CreateSchoolDocumentDto): Promise<SchoolDocumentResponseDto> {
    return SchoolDocumentResponseDto.from(
      await this.service.create({
        documentType: body.documentType,
        label: body.label,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        storageUrl: body.storageUrl,
        issueDate: body.issueDate === undefined ? undefined : body.issueDate === null ? null : new Date(body.issueDate),
        expiryDate: body.expiryDate === undefined ? undefined : body.expiryDate === null ? null : new Date(body.expiryDate),
        issuingAuthority: body.issuingAuthority,
        docNumber: body.docNumber,
        notes: body.notes,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(SchoolPermissions.DOCUMENT_READ)
  @ApiOperation({ summary: 'Read a single school document.' })
  @ApiOkResponse({ type: SchoolDocumentResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<SchoolDocumentResponseDto> {
    return SchoolDocumentResponseDto.from(await this.service.get(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(SchoolPermissions.DOCUMENT_DELETE)
  @ApiOperation({ summary: 'Detach a school document.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
