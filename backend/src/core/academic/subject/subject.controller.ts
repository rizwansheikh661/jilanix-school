/**
 * SubjectController — HTTP routes for `/api/v1/subjects`. Supports
 * `?type=CORE|ELECTIVE|LANGUAGE|OTHER` to filter list results.
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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import { parseIfMatch } from '../academic.errors';
import { SUBJECT_TYPE_VALUES, type SubjectTypeValue } from '../academic.types';
import {
  CreateSubjectDto,
  SubjectListResponseDto,
  SubjectResponseDto,
  UpdateSubjectDto,
} from './subject.dto';
import { SubjectService } from './subject.service';

class SubjectListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SUBJECT_TYPE_VALUES as unknown as object)
  public readonly type?: SubjectTypeValue;
}

@ApiTags('Subjects')
@ApiBearerAuth()
@Controller({ path: 'subjects', version: '1' })
export class SubjectController {
  constructor(private readonly service: SubjectService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.SUBJECT_READ)
  @ApiOperation({ summary: 'List subjects; filter by type.' })
  @ApiQuery({ name: 'type', required: false, enum: SUBJECT_TYPE_VALUES as unknown as string[] })
  @ApiOkResponse({ type: SubjectListResponseDto })
  public async list(@Query() query: SubjectListQueryDto): Promise<SubjectListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
    });
    return {
      items: result.items.map(SubjectResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AcademicPermissions.SUBJECT_CREATE)
  @ApiOperation({ summary: 'Create a subject.' })
  @ApiCreatedResponse({ type: SubjectResponseDto })
  @ApiConflictResponse({ description: 'duplicate code within school' })
  public async create(@Body() body: CreateSubjectDto): Promise<SubjectResponseDto> {
    return SubjectResponseDto.from(
      await this.service.create({ name: body.name, code: body.code, type: body.type }),
    );
  }

  @Get(':id')
  @RequirePermissions(AcademicPermissions.SUBJECT_READ)
  @ApiOperation({ summary: 'Get a single subject.' })
  @ApiOkResponse({ type: SubjectResponseDto })
  @ApiNotFoundResponse()
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<SubjectResponseDto> {
    return SubjectResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AcademicPermissions.SUBJECT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a subject.' })
  @ApiOkResponse({ type: SubjectResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or duplicate code' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSubjectDto,
  ): Promise<SubjectResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return SubjectResponseDto.from(
      await this.service.update(id, expectedVersion, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicPermissions.SUBJECT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a subject.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
