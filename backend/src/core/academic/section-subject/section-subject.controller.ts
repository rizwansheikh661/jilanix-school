/**
 * SectionSubjectController — two mount points:
 *   - `/sections/:sectionId/subjects` — returns the *effective* subject set
 *     (ClassDefaults ± overrides).
 *   - `/sections/:sectionId/subject-overrides` — list/create/delete the
 *     override rows themselves.
 *
 * Splitting the routes keeps the common "what subjects does this section
 * teach?" query separate from the override-management surface.
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import {
  CreateSectionSubjectDto,
  EffectiveSectionSubjectsResponseDto,
  SectionSubjectListResponseDto,
  SectionSubjectResponseDto,
} from './section-subject.dto';
import { SectionSubjectService } from './section-subject.service';

@ApiTags('SectionSubjects')
@ApiBearerAuth()
@Controller({ path: 'sections/:sectionId', version: '1' })
export class SectionSubjectController {
  constructor(private readonly service: SectionSubjectService) {}

  @Get('subjects')
  @RequirePermissions(AcademicPermissions.SECTION_SUBJECT_READ)
  @ApiOperation({ summary: 'List effective subjects for a section (resolved with overrides).' })
  @ApiOkResponse({ type: EffectiveSectionSubjectsResponseDto })
  @ApiNotFoundResponse()
  public async listEffective(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
  ): Promise<EffectiveSectionSubjectsResponseDto> {
    return EffectiveSectionSubjectsResponseDto.from(await this.service.listEffective(sectionId));
  }

  @Get('subject-overrides')
  @RequirePermissions(AcademicPermissions.SECTION_SUBJECT_READ)
  @ApiOperation({ summary: 'List section-level subject overrides (ADD/REMOVE/REPLACE).' })
  @ApiOkResponse({ type: SectionSubjectListResponseDto })
  @ApiNotFoundResponse()
  public async listOverrides(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
  ): Promise<SectionSubjectListResponseDto> {
    const rows = await this.service.listOverrides(sectionId);
    return { items: rows.map(SectionSubjectResponseDto.from) };
  }

  @Post('subject-overrides')
  @RequirePermissions(AcademicPermissions.SECTION_SUBJECT_CREATE)
  @ApiOperation({ summary: 'Add a section-level subject override.' })
  @ApiCreatedResponse({ type: SectionSubjectResponseDto })
  @ApiUnprocessableEntityResponse()
  public async create(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Body() body: CreateSectionSubjectDto,
  ): Promise<SectionSubjectResponseDto> {
    const row = await this.service.create({
      sectionId,
      subjectId: body.subjectId,
      mode: body.mode,
      ...(body.replacesSubjectId !== undefined
        ? { replacesSubjectId: body.replacesSubjectId }
        : {}),
    });
    return SectionSubjectResponseDto.from(row);
  }

  @Delete('subject-overrides/:overrideId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AcademicPermissions.SECTION_SUBJECT_DELETE)
  @ApiOperation({ summary: 'Remove a section-level subject override.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('sectionId', new ParseUUIDPipe()) _sectionId: string,
    @Param('overrideId', new ParseUUIDPipe()) overrideId: string,
  ): Promise<void> {
    await this.service.delete(overrideId);
  }
}
