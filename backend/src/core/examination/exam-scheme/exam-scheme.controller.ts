/**
 * ExamSchemeController — `/exams/schemes` routes.
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
import { ExaminationPermissions } from '../examination.constants';
import {
  CreateExamSchemeDto,
  ExamSchemeListQueryDto,
  ExamSchemeListResponseDto,
  ExamSchemeResponseDto,
  UpdateExamSchemeDto,
} from './exam-scheme.dto';
import { ExamSchemeService } from './exam-scheme.service';

@ApiTags('Examination')
@ApiBearerAuth()
@Controller({ path: 'exams/schemes', version: '1' })
export class ExamSchemeController {
  constructor(private readonly service: ExamSchemeService) {}

  @Get()
  @RequirePermissions(ExaminationPermissions.SCHEME_READ)
  @ApiOperation({ summary: 'List exam schemes (cursor paginated).' })
  @ApiOkResponse({ type: ExamSchemeListResponseDto })
  public async list(
    @Query() query: ExamSchemeListQueryDto,
  ): Promise<ExamSchemeListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.name !== undefined ? { nameContains: query.name } : {}),
    });
    return {
      items: items.map(ExamSchemeResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(ExaminationPermissions.SCHEME_READ)
  @ApiOperation({ summary: 'Get an exam scheme by id (with bands).' })
  @ApiOkResponse({ type: ExamSchemeResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExamSchemeResponseDto> {
    return ExamSchemeResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(ExaminationPermissions.SCHEME_CREATE)
  @ApiOperation({ summary: 'Create an exam scheme with its grade bands.' })
  @ApiCreatedResponse({ type: ExamSchemeResponseDto })
  public async create(
    @Body() body: CreateExamSchemeDto,
  ): Promise<ExamSchemeResponseDto> {
    const row = await this.service.create({
      name: body.name,
      ...(body.boardType !== undefined ? { boardType: body.boardType } : {}),
      passingPct: body.passingPct,
      marksEditWindowDays: body.marksEditWindowDays,
      ...(body.description !== undefined ? { description: body.description } : {}),
      bands: body.bands.map((b) => ({
        gradeLetter: b.gradeLetter,
        ...(b.gradePoint !== undefined ? { gradePoint: b.gradePoint } : {}),
        minPct: b.minPct,
        maxPct: b.maxPct,
        ordering: b.ordering,
      })),
    });
    return ExamSchemeResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(ExaminationPermissions.SCHEME_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Update exam scheme; supply `bands[]` to replace the band set entirely.',
  })
  @ApiOkResponse({ type: ExamSchemeResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateExamSchemeDto,
  ): Promise<ExamSchemeResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.boardType !== undefined ? { boardType: body.boardType } : {}),
      ...(body.passingPct !== undefined ? { passingPct: body.passingPct } : {}),
      ...(body.marksEditWindowDays !== undefined
        ? { marksEditWindowDays: body.marksEditWindowDays }
        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.bands !== undefined
        ? {
            bands: body.bands.map((b) => ({
              gradeLetter: b.gradeLetter,
              ...(b.gradePoint !== undefined ? { gradePoint: b.gradePoint } : {}),
              minPct: b.minPct,
              maxPct: b.maxPct,
              ordering: b.ordering,
            })),
          }
        : {}),
    });
    return ExamSchemeResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ExaminationPermissions.SCHEME_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Soft-delete an exam scheme (refused if a non-archived exam references it).',
  })
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
