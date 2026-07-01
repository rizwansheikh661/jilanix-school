/**
 * ClassSubjectController — `GET /classes/:classId/subjects` returns the
 * current default-subject set; `PUT /classes/:classId/subjects` replaces it
 * idempotently. No individual POST/DELETE — set membership is managed in one
 * transactional swap so partial states are not observable.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { AcademicPermissions } from '../academic.constants';
import {
  ClassSubjectListResponseDto,
  ClassSubjectResponseDto,
  SetClassSubjectsDto,
} from './class-subject.dto';
import { ClassSubjectService } from './class-subject.service';

@ApiTags('ClassSubjects')
@ApiBearerAuth()
@Controller({ path: 'classes/:classId/subjects', version: '1' })
export class ClassSubjectController {
  constructor(private readonly service: ClassSubjectService) {}

  @Get()
  @RequirePermissions(AcademicPermissions.CLASS_SUBJECT_READ)
  @ApiOperation({ summary: 'List default subjects offered by a class.' })
  @ApiOkResponse({ type: ClassSubjectListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ): Promise<ClassSubjectListResponseDto> {
    const rows = await this.service.list(classId);
    return { items: rows.map(ClassSubjectResponseDto.from) };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AcademicPermissions.CLASS_SUBJECT_SET)
  @ApiOperation({ summary: 'Replace the default subject set for a class (idempotent).' })
  @ApiOkResponse({ type: ClassSubjectListResponseDto })
  @ApiNotFoundResponse()
  public async set(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body() body: SetClassSubjectsDto,
  ): Promise<ClassSubjectListResponseDto> {
    const rows = await this.service.setForClass({
      classId,
      subjects: body.subjects.map((s) => ({
        subjectId: s.subjectId,
        ...(s.isOptional !== undefined ? { isOptional: s.isOptional } : {}),
        ...(s.weeklyPeriods !== undefined ? { weeklyPeriods: s.weeklyPeriods } : {}),
      })),
    });
    return { items: rows.map(ClassSubjectResponseDto.from) };
  }
}
