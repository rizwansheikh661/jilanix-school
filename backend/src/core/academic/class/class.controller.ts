/**
 * ClassController — HTTP routes for the `classes` resource at
 * `/api/v1/classes`. Mirrors the AcademicYear controller pattern; see
 * `academic-year.controller.ts` for the shared conventions around
 * `If-Match`, cursor pagination, and the global guards/interceptors.
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
  ApiTags,
} from '@nestjs/swagger';

import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import { parseIfMatch } from '../academic.errors';
import {
  ClassListResponseDto,
  ClassResponseDto,
  CreateClassDto,
  UpdateClassDto,
} from './class.dto';
import { ClassService } from './class.service';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller({ path: 'classes', version: '1' })
export class ClassController {
  constructor(private readonly service: ClassService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.CLASS_READ)
  @ApiOperation({ summary: 'List classes for the current tenant.' })
  @ApiOkResponse({ type: ClassListResponseDto })
  public async list(@Query() query: PaginationQueryDto): Promise<ClassListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
    });
    return {
      items: result.items.map(ClassResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AcademicPermissions.CLASS_CREATE)
  @ApiOperation({ summary: 'Create a class.' })
  @ApiCreatedResponse({ type: ClassResponseDto })
  @ApiConflictResponse({ description: 'duplicate name within school' })
  public async create(@Body() body: CreateClassDto): Promise<ClassResponseDto> {
    const row = await this.service.create({
      name: body.name,
      gradeLevel: body.gradeLevel,
      ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
    });
    return ClassResponseDto.from(row);
  }

  @Get(':id')
  @RequirePermissions(AcademicPermissions.CLASS_READ)
  @ApiOperation({ summary: 'Get a single class.' })
  @ApiOkResponse({ type: ClassResponseDto })
  @ApiNotFoundResponse()
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ClassResponseDto> {
    return ClassResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AcademicPermissions.CLASS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a class.' })
  @ApiOkResponse({ type: ClassResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or duplicate name' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateClassDto,
  ): Promise<ClassResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return ClassResponseDto.from(
      await this.service.update(id, expectedVersion, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.gradeLevel !== undefined ? { gradeLevel: body.gradeLevel } : {}),
        ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicPermissions.CLASS_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a class (blocked if non-deleted sections exist).' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'sections still reference the class' })
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
