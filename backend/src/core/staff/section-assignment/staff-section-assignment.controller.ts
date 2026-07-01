/**
 * StaffSectionAssignmentController — `/staff/:id/section-assignments`.
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
import { IsOptional, IsUUID } from 'class-validator';

import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import {
  CreateStaffSectionAssignmentDto,
  StaffSectionAssignmentListResponseDto,
  StaffSectionAssignmentResponseDto,
} from './staff-section-assignment.dto';
import { StaffSectionAssignmentService } from './staff-section-assignment.service';

class ListAssignmentQueryDto {
  @IsOptional() @IsUUID()
  public readonly sectionId?: string;
  @IsOptional() @IsUUID()
  public readonly subjectId?: string;
  @IsOptional() @IsUUID()
  public readonly academicYearId?: string;
}

@ApiTags('StaffSectionAssignments')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/section-assignments', version: '1' })
export class StaffSectionAssignmentController {
  constructor(private readonly service: StaffSectionAssignmentService) {}

  @Get()
  @RequirePermissions(StaffPermissions.SECTION_ASSIGNMENT_READ)
  @ApiOperation({ summary: 'List teaching assignments for this staff record.' })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiOkResponse({ type: StaffSectionAssignmentListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Query() query: ListAssignmentQueryDto,
  ): Promise<StaffSectionAssignmentListResponseDto> {
    const items = await this.service.list({
      staffId,
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId !== undefined ? { subjectId: query.subjectId } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
    });
    return { items: items.map(StaffSectionAssignmentResponseDto.from) };
  }

  @Post()
  @RequirePermissions(StaffPermissions.SECTION_ASSIGNMENT_CREATE)
  @ApiOperation({ summary: 'Assign this staff to a section / subject for a year.' })
  @ApiCreatedResponse({ type: StaffSectionAssignmentResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Body() body: CreateStaffSectionAssignmentDto,
  ): Promise<StaffSectionAssignmentResponseDto> {
    return StaffSectionAssignmentResponseDto.from(
      await this.service.create(staffId, {
        sectionId: body.sectionId,
        subjectId: body.subjectId,
        academicYearId: body.academicYearId,
        ...(body.periodsPerWeek !== undefined ? { periodsPerWeek: body.periodsPerWeek } : {}),
      }),
    );
  }

  @Delete(':assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(StaffPermissions.SECTION_ASSIGNMENT_DELETE)
  @ApiOperation({ summary: 'Remove a teaching assignment from this staff record.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
  ): Promise<void> {
    await this.service.delete(staffId, assignmentId);
  }
}
