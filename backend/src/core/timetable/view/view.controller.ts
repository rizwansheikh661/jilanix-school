/**
 * Read-only derived timetable views (`section`, `teacher`, `room`).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { PERIOD_TYPE_VALUES, TimetablePermissions, type PeriodTypeValue } from '../timetable.constants';
import { TimetableEntryResponseDto } from '../entry/entry.dto';
import { TimetableVersionResponseDto } from '../version/version.dto';
import { TimetableViewService, type TimetableView } from './view.service';

class TimetableViewPeriodDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly index!: number;
  @ApiProperty() public readonly label!: string;
  @ApiProperty({ enum: PERIOD_TYPE_VALUES as unknown as string[] })
  public readonly type!: PeriodTypeValue;
  @ApiProperty() public readonly startTime!: string;
  @ApiProperty() public readonly endTime!: string;
}

class TimetableViewCellDto {
  @ApiProperty() public readonly dayOfWeek!: number;
  @ApiProperty() public readonly periodIndex!: number;
  @ApiPropertyOptional({ type: () => TimetableEntryResponseDto, nullable: true })
  public readonly entry!: TimetableEntryResponseDto | null;
}

export class TimetableViewResponseDto {
  @ApiProperty({ type: () => TimetableVersionResponseDto })
  public readonly version!: TimetableVersionResponseDto;

  @ApiProperty({ type: () => [TimetableViewPeriodDto] })
  public readonly periods!: readonly TimetableViewPeriodDto[];

  @ApiProperty({ type: 'array', items: { type: 'integer' } })
  public readonly days!: readonly number[];

  @ApiProperty({ type: () => [TimetableViewCellDto] })
  public readonly cells!: readonly TimetableViewCellDto[];

  public static from(view: TimetableView): TimetableViewResponseDto {
    return {
      version: TimetableVersionResponseDto.from(view.version),
      periods: view.periods.map((p) => ({
        id: p.id,
        index: p.index,
        label: p.label,
        type: p.type,
        startTime: p.startTime,
        endTime: p.endTime,
      })),
      days: view.days,
      cells: view.cells.map((c) => ({
        dayOfWeek: c.dayOfWeek,
        periodIndex: c.periodIndex,
        entry: c.entry === null ? null : TimetableEntryResponseDto.from(c.entry),
      })),
    };
  }
}

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller({ path: 'timetable', version: '1' })
export class TimetableViewController {
  constructor(private readonly service: TimetableViewService) {}

  @Get('sections/:sectionId/timetable')
  @RequirePermissions(TimetablePermissions.VIEW_SECTION)
  @ApiOperation({ summary: 'Get a section\u2019s weekly timetable.' })
  @ApiQuery({ name: 'versionId', required: true, format: 'uuid' })
  @ApiOkResponse({ type: TimetableViewResponseDto })
  @ApiNotFoundResponse()
  public async sectionView(
    @Param('sectionId', new ParseUUIDPipe()) sectionId: string,
    @Query('versionId', new ParseUUIDPipe()) versionId: string,
  ): Promise<TimetableViewResponseDto> {
    return TimetableViewResponseDto.from(
      await this.service.sectionView(versionId, sectionId),
    );
  }

  @Get('teachers/:staffId/timetable')
  @RequirePermissions(TimetablePermissions.TEACHER_READ)
  @ApiOperation({ summary: 'Get a teacher\u2019s weekly timetable.' })
  @ApiQuery({ name: 'versionId', required: true, format: 'uuid' })
  @ApiOkResponse({ type: TimetableViewResponseDto })
  @ApiNotFoundResponse()
  public async teacherView(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @Query('versionId', new ParseUUIDPipe()) versionId: string,
  ): Promise<TimetableViewResponseDto> {
    return TimetableViewResponseDto.from(
      await this.service.teacherView(versionId, staffId),
    );
  }

  @Get('rooms/:roomId/timetable')
  @RequirePermissions(TimetablePermissions.VIEW_ROOM)
  @ApiOperation({ summary: 'Get a room\u2019s weekly timetable.' })
  @ApiQuery({ name: 'versionId', required: true, format: 'uuid' })
  @ApiOkResponse({ type: TimetableViewResponseDto })
  @ApiNotFoundResponse()
  public async roomView(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Query('versionId', new ParseUUIDPipe()) versionId: string,
  ): Promise<TimetableViewResponseDto> {
    return TimetableViewResponseDto.from(
      await this.service.roomView(versionId, roomId),
    );
  }
}
