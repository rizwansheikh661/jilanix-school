/**
 * ClassTeacherController — top-level `/class-teachers` routes (the homeroom
 * link is its own concept, not nested under `/staff/:id`).
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
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import {
  AssignClassTeacherDto,
  ClassTeacherListResponseDto,
  ClassTeacherResponseDto,
  RevokeClassTeacherDto,
} from './class-teacher.dto';
import { ClassTeacherService } from './class-teacher.service';

class ClassTeacherListQueryDto {
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;
  @IsOptional() @IsUUID()
  public readonly staffId?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  public readonly activeOnly?: boolean;
}

@ApiTags('ClassTeachers')
@ApiBearerAuth()
@Controller({ path: 'class-teachers', version: '1' })
export class ClassTeacherController {
  constructor(private readonly service: ClassTeacherService) {}

  @Get()
  @RequirePermissions(StaffPermissions.CLASS_TEACHER_READ)
  @ApiOperation({ summary: 'List class-teacher (homeroom) assignments.' })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiOkResponse({ type: ClassTeacherListResponseDto })
  public async list(@Query() query: ClassTeacherListQueryDto): Promise<ClassTeacherListResponseDto> {
    const items = await this.service.list({
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.staffId !== undefined ? { staffId: query.staffId } : {}),
      ...(query.activeOnly !== undefined ? { activeOnly: query.activeOnly } : {}),
    });
    return { items: items.map(ClassTeacherResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(StaffPermissions.CLASS_TEACHER_READ)
  @ApiOperation({ summary: 'Get a class-teacher assignment.' })
  @ApiOkResponse({ type: ClassTeacherResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ClassTeacherResponseDto> {
    return ClassTeacherResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(StaffPermissions.CLASS_TEACHER_ASSIGN)
  @ApiOperation({ summary: 'Assign a class teacher to a section / year.' })
  @ApiCreatedResponse({ type: ClassTeacherResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'section already has an active class teacher for this year' })
  public async assign(
    @Body() body: AssignClassTeacherDto,
  ): Promise<ClassTeacherResponseDto> {
    return ClassTeacherResponseDto.from(
      await this.service.assign({
        staffId: body.staffId,
        sectionId: body.sectionId,
        academicYearId: body.academicYearId,
        assignedOn: new Date(body.assignedOn),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(StaffPermissions.CLASS_TEACHER_REVOKE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Revoke a class-teacher assignment.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'already revoked or version conflict' })
  public async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RevokeClassTeacherDto,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.revoke(id, expectedVersion, new Date(body.revokedOn));
  }
}
