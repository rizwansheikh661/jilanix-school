/**
 * StaffSubjectQualificationController — `/staff/:id/subject-qualifications`.
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import {
  ReplaceStaffSubjectQualificationsDto,
  StaffSubjectQualificationListResponseDto,
  StaffSubjectQualificationResponseDto,
} from './staff-subject-qualification.dto';
import { StaffSubjectQualificationService } from './staff-subject-qualification.service';

@ApiTags('StaffSubjectQualifications')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/subject-qualifications', version: '1' })
export class StaffSubjectQualificationController {
  constructor(private readonly service: StaffSubjectQualificationService) {}

  @Get()
  @RequirePermissions(StaffPermissions.SUBJECT_QUALIFICATION_READ)
  @ApiOperation({ summary: 'List the subjects a staff member is qualified to teach.' })
  @ApiOkResponse({ type: StaffSubjectQualificationListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
  ): Promise<StaffSubjectQualificationListResponseDto> {
    const items = await this.service.list(staffId);
    return { items: items.map(StaffSubjectQualificationResponseDto.from) };
  }

  @Put()
  @RequirePermissions(StaffPermissions.SUBJECT_QUALIFICATION_SET)
  @ApiOperation({ summary: 'Replace the full set of subject qualifications.' })
  @ApiOkResponse({ type: StaffSubjectQualificationListResponseDto })
  @ApiNotFoundResponse()
  public async replace(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Body() body: ReplaceStaffSubjectQualificationsDto,
  ): Promise<StaffSubjectQualificationListResponseDto> {
    const items = await this.service.replace(
      staffId,
      body.items.map((i) => ({
        subjectId: i.subjectId,
        ...(i.proficiency !== undefined ? { proficiency: i.proficiency } : {}),
      })),
    );
    return { items: items.map(StaffSubjectQualificationResponseDto.from) };
  }
}
