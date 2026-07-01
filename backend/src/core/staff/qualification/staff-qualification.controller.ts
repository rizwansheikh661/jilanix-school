/**
 * StaffQualificationController — routes for `/staff/:id/qualifications`.
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
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import {
  CreateStaffQualificationDto,
  StaffQualificationListResponseDto,
  StaffQualificationResponseDto,
} from './staff-qualification.dto';
import { StaffQualificationService } from './staff-qualification.service';

@ApiTags('StaffQualifications')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/qualifications', version: '1' })
export class StaffQualificationController {
  constructor(private readonly service: StaffQualificationService) {}

  @Get()
  @RequirePermissions(StaffPermissions.QUALIFICATION_READ)
  @ApiOperation({ summary: 'List qualifications for this staff record.' })
  @ApiOkResponse({ type: StaffQualificationListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
  ): Promise<StaffQualificationListResponseDto> {
    const items = await this.service.list(staffId);
    return { items: items.map(StaffQualificationResponseDto.from) };
  }

  @Post()
  @RequirePermissions(StaffPermissions.QUALIFICATION_CREATE)
  @ApiOperation({ summary: 'Add a qualification to this staff record.' })
  @ApiCreatedResponse({ type: StaffQualificationResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Body() body: CreateStaffQualificationDto,
  ): Promise<StaffQualificationResponseDto> {
    return StaffQualificationResponseDto.from(
      await this.service.create(staffId, {
        qualificationType: body.qualificationType,
        name: body.name,
        ...(body.institution !== undefined ? { institution: body.institution } : {}),
        ...(body.yearAwarded !== undefined ? { yearAwarded: body.yearAwarded } : {}),
        ...(body.gradeOrScore !== undefined ? { gradeOrScore: body.gradeOrScore } : {}),
      }),
    );
  }

  @Delete(':qualificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(StaffPermissions.QUALIFICATION_DELETE)
  @ApiOperation({ summary: 'Remove a qualification from this staff record.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('qualificationId', new ParseUUIDPipe()) qualificationId: string,
  ): Promise<void> {
    await this.service.delete(staffId, qualificationId);
  }
}
