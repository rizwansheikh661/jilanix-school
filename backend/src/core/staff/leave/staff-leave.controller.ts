/**
 * StaffLeaveController — `/staff/:id/leaves`.
 */
import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import { LEAVE_STATUS_VALUES, type LeaveStatusValue } from '../staff.types';
import {
  CreateStaffLeaveDto,
  LeaveDecisionDto,
  StaffLeaveListResponseDto,
  StaffLeaveResponseDto,
  UpdateStaffLeaveDto,
} from './staff-leave.dto';
import { StaffLeaveService } from './staff-leave.service';

class StaffLeaveListQueryDto {
  @IsOptional()
  @IsEnum(LEAVE_STATUS_VALUES as unknown as object)
  public readonly status?: LeaveStatusValue;
}

@ApiTags('StaffLeaves')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/leaves', version: '1' })
export class StaffLeaveController {
  constructor(private readonly service: StaffLeaveService) {}

  @Get()
  @RequirePermissions(StaffPermissions.LEAVE_READ)
  @ApiOperation({ summary: 'List leaves for this staff record.' })
  @ApiQuery({ name: 'status', required: false, enum: LEAVE_STATUS_VALUES as unknown as string[] })
  @ApiOkResponse({ type: StaffLeaveListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Query() query: StaffLeaveListQueryDto,
  ): Promise<StaffLeaveListResponseDto> {
    const items = await this.service.list({
      staffId,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return { items: items.map(StaffLeaveResponseDto.from) };
  }

  @Get(':leaveId')
  @RequirePermissions(StaffPermissions.LEAVE_READ)
  @ApiOperation({ summary: 'Get a staff leave.' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
  ): Promise<StaffLeaveResponseDto> {
    return StaffLeaveResponseDto.from(await this.service.getById(staffId, leaveId));
  }

  @Post()
  @RequirePermissions(StaffPermissions.LEAVE_CREATE)
  @ApiOperation({ summary: 'Create a staff leave request in DRAFT.' })
  @ApiCreatedResponse({ type: StaffLeaveResponseDto })
  @ApiNotFoundResponse()
  public async create(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Body() body: CreateStaffLeaveDto,
  ): Promise<StaffLeaveResponseDto> {
    return StaffLeaveResponseDto.from(
      await this.service.create(staffId, {
        leaveType: body.leaveType,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        days: body.days,
        reason: body.reason,
      }),
    );
  }

  @Patch(':leaveId')
  @RequirePermissions(StaffPermissions.LEAVE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a DRAFT staff leave request.' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'invalid status or version conflict' })
  public async update(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateStaffLeaveDto,
  ): Promise<StaffLeaveResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffLeaveResponseDto.from(
      await this.service.update(staffId, leaveId, expectedVersion, {
        ...(body.leaveType !== undefined ? { leaveType: body.leaveType } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: new Date(body.endDate) } : {}),
        ...(body.days !== undefined ? { days: body.days } : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      }),
    );
  }

  @Post(':leaveId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.LEAVE_SUBMIT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Submit a DRAFT leave request for review.' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiConflictResponse({ description: 'invalid state transition' })
  public async submit(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StaffLeaveResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffLeaveResponseDto.from(
      await this.service.submit(staffId, leaveId, expectedVersion),
    );
  }

  @Post(':leaveId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.LEAVE_APPROVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a submitted leave request.' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiConflictResponse({ description: 'invalid state transition' })
  public async approve(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LeaveDecisionDto,
  ): Promise<StaffLeaveResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffLeaveResponseDto.from(
      await this.service.approve(staffId, leaveId, expectedVersion, body.note ?? null),
    );
  }

  @Post(':leaveId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.LEAVE_REJECT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a submitted leave request.' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiConflictResponse({ description: 'invalid state transition' })
  public async reject(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LeaveDecisionDto,
  ): Promise<StaffLeaveResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffLeaveResponseDto.from(
      await this.service.reject(staffId, leaveId, expectedVersion, body.note ?? null),
    );
  }

  @Post(':leaveId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.LEAVE_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a leave request (DRAFT or SUBMITTED).' })
  @ApiOkResponse({ type: StaffLeaveResponseDto })
  @ApiConflictResponse({ description: 'invalid state transition' })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) staffId: string,
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LeaveDecisionDto,
  ): Promise<StaffLeaveResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffLeaveResponseDto.from(
      await this.service.cancel(staffId, leaveId, expectedVersion, body.note ?? null),
    );
  }
}
