/**
 * TeacherLoadController — read-only views over `teacher_load`.
 */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { TimetablePermissions } from '../timetable.constants';
import {
  TeacherLoadListResponseDto,
  TeacherLoadResponseDto,
} from './teacher-load.dto';
import { TeacherLoadService } from './teacher-load.service';

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable/teacher-load', version: '1' })
export class TeacherLoadController {
  constructor(private readonly service: TeacherLoadService) {}

  @Get()
  @RequirePermissions(TimetablePermissions.TEACHER_LOAD_READ)
  @ApiOperation({ summary: 'List teacher load rows for a timetable version.' })
  @ApiQuery({ name: 'versionId', required: true, format: 'uuid' })
  @ApiOkResponse({ type: TeacherLoadListResponseDto })
  public async list(
    @Query('versionId', new ParseUUIDPipe()) versionId: string,
  ): Promise<TeacherLoadListResponseDto> {
    const items = await this.service.listForVersion(versionId);
    return {
      items: items.map(TeacherLoadResponseDto.from),
      nextCursor: null,
    };
  }

  @Get(':versionId/:staffId')
  @RequirePermissions(TimetablePermissions.TEACHER_LOAD_READ)
  @ApiOperation({ summary: 'Read a single (version, staff) load row.' })
  @ApiOkResponse({ type: TeacherLoadResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
  ): Promise<TeacherLoadResponseDto> {
    const row = await this.service.getForStaff(versionId, staffId);
    if (row === null) {
      throw new NotFoundException(`TeacherLoad(version=${versionId}, staff=${staffId}) not found`);
    }
    return TeacherLoadResponseDto.from(row);
  }
}
