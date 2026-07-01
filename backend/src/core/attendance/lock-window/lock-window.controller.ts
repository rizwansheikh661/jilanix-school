/**
 * AttendanceLockWindowController — `/attendance/lock-windows` routes.
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
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { AttendancePermissions } from '../attendance.constants';
import {
  CreateLockWindowDto,
  LockWindowListQueryDto,
  LockWindowListResponseDto,
  LockWindowResponseDto,
} from './lock-window.dto';
import { AttendanceLockWindowService } from './lock-window.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance/lock-windows', version: '1' })
export class AttendanceLockWindowController {
  constructor(private readonly service: AttendanceLockWindowService) {}

  @Get()
  @RequirePermissions(AttendancePermissions.LOCK_READ)
  @ApiOperation({ summary: 'List attendance lock windows.' })
  @ApiOkResponse({ type: LockWindowListResponseDto })
  public async list(
    @Query() query: LockWindowListQueryDto,
  ): Promise<LockWindowListResponseDto> {
    const rows = await this.service.list({
      ...(query.scope !== undefined ? { scope: query.scope } : {}),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.activeOn !== undefined ? { activeOn: new Date(query.activeOn) } : {}),
    });
    return { items: rows.map(LockWindowResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(AttendancePermissions.LOCK_READ)
  @ApiOperation({ summary: 'Get a lock window by id.' })
  @ApiOkResponse({ type: LockWindowResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<LockWindowResponseDto> {
    return LockWindowResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(AttendancePermissions.LOCK_CREATE)
  @ApiOperation({ summary: 'Create an attendance lock window.' })
  @ApiCreatedResponse({ type: LockWindowResponseDto })
  public async create(@Body() body: CreateLockWindowDto): Promise<LockWindowResponseDto> {
    const row = await this.service.create({
      scope: body.scope,
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return LockWindowResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AttendancePermissions.LOCK_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Unlock (soft-delete) an attendance lock window.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.unlock(id, expectedVersion);
  }
}
