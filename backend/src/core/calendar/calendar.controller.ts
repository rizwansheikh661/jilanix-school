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
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../http/if-match';
import { RequirePermissions } from '../rbac';
import { CalendarPermissions } from './calendar.constants';
import {
  CalendarEventListQueryDto,
  CalendarEventListResponseDto,
  CalendarEventResponseDto,
  CreateCalendarEventDto,
  CreateHolidayDto,
  HolidayListQueryDto,
  HolidayListResponseDto,
  HolidayResponseDto,
  UpcomingCalendarEventQueryDto,
  UpdateCalendarEventDto,
  UpdateHolidayDto,
  UpsertWorkingDaysDto,
  WorkingDayResolutionResponseDto,
  WorkingDaysConfigurationListResponseDto,
  WorkingDaysConfigurationResponseDto,
  WorkingDaysQueryDto,
  WorkingDaysResolveQueryDto,
} from './calendar.dto';
import {
  CalendarEventService,
  HolidayService,
  WorkingDayResolutionService,
  WorkingDaysService,
} from './calendar.service';

@ApiTags('Holidays')
@ApiBearerAuth()
@Controller({ path: 'holidays', version: '1' })
export class HolidayController {
  constructor(private readonly service: HolidayService) {}

  @Get()
  @RequirePermissions(CalendarPermissions.HOLIDAY_READ)
  @ApiOkResponse({ type: HolidayListResponseDto })
  public async list(@Query() query: HolidayListQueryDto): Promise<HolidayListResponseDto> {
    const items = await this.service.list({
      branchId: query.branchId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      type: query.type,
    });
    return { items: items.map(HolidayResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(CalendarPermissions.HOLIDAY_READ)
  @ApiOkResponse({ type: HolidayResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<HolidayResponseDto> {
    return HolidayResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(CalendarPermissions.HOLIDAY_CREATE)
  @ApiCreatedResponse({ type: HolidayResponseDto })
  public async create(@Body() body: CreateHolidayDto): Promise<HolidayResponseDto> {
    return HolidayResponseDto.from(
      await this.service.create({
        branchId: body.branchId,
        name: body.name,
        date: body.date,
        type: body.type,
        isFullDay: body.isFullDay ?? true,
        halfDaySession: body.halfDaySession,
        attendanceTreatment: body.attendanceTreatment,
        notes: body.notes,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(CalendarPermissions.HOLIDAY_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: HolidayResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateHolidayDto,
  ): Promise<HolidayResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return HolidayResponseDto.from(
      await this.service.update(id, expectedVersion, {
        branchId: body.branchId,
        name: body.name,
        date: body.date,
        type: body.type,
        isFullDay: body.isFullDay,
        halfDaySession: body.halfDaySession,
        attendanceTreatment: body.attendanceTreatment,
        notes: body.notes,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(CalendarPermissions.HOLIDAY_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}

@ApiTags('Calendar Events')
@ApiBearerAuth()
@Controller({ path: 'calendar', version: '1' })
export class CalendarEventController {
  constructor(private readonly service: CalendarEventService) {}

  @Get('events')
  @RequirePermissions(CalendarPermissions.EVENT_READ)
  @ApiOkResponse({ type: CalendarEventListResponseDto })
  public async list(
    @Query() query: CalendarEventListQueryDto,
  ): Promise<CalendarEventListResponseDto> {
    const items = await this.service.list({
      branchId: query.branchId,
      academicYearId: query.academicYearId,
      type: query.type,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return { items: items.map(CalendarEventResponseDto.from) };
  }

  @Get('upcoming')
  @RequirePermissions(CalendarPermissions.EVENT_READ)
  @ApiOkResponse({ type: CalendarEventListResponseDto })
  public async upcoming(
    @Query() query: UpcomingCalendarEventQueryDto,
  ): Promise<CalendarEventListResponseDto> {
    const fromDate = query.fromDate ?? new Date();
    const toDate = query.toDate ?? new Date(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = await this.service.listUpcoming({
      fromDate,
      toDate,
      branchId: query.branchId,
    });
    return { items: items.map(CalendarEventResponseDto.from) };
  }

  @Get('events/:id')
  @RequirePermissions(CalendarPermissions.EVENT_READ)
  @ApiOkResponse({ type: CalendarEventResponseDto })
  @ApiNotFoundResponse()
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CalendarEventResponseDto> {
    return CalendarEventResponseDto.from(await this.service.get(id));
  }

  @Post('events')
  @RequirePermissions(CalendarPermissions.EVENT_CREATE)
  @ApiCreatedResponse({ type: CalendarEventResponseDto })
  public async create(
    @Body() body: CreateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    return CalendarEventResponseDto.from(
      await this.service.create({
        branchId: body.branchId,
        academicYearId: body.academicYearId,
        type: body.type,
        title: body.title,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        allDay: body.allDay,
        startTime: body.startTime,
        endTime: body.endTime,
        audienceJson: body.audienceJson,
        colorHex: body.colorHex,
        isRecurring: body.isRecurring,
        recurrenceRule: body.recurrenceRule,
      }),
    );
  }

  @Patch('events/:id')
  @RequirePermissions(CalendarPermissions.EVENT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: CalendarEventResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return CalendarEventResponseDto.from(
      await this.service.update(id, expectedVersion, {
        branchId: body.branchId,
        academicYearId: body.academicYearId,
        type: body.type,
        title: body.title,
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        allDay: body.allDay,
        startTime: body.startTime,
        endTime: body.endTime,
        audienceJson: body.audienceJson,
        colorHex: body.colorHex,
        isRecurring: body.isRecurring,
        recurrenceRule: body.recurrenceRule,
      }),
    );
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(CalendarPermissions.EVENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}

@ApiTags('Working Days')
@ApiBearerAuth()
@Controller({ path: 'working-days', version: '1' })
export class WorkingDaysController {
  constructor(
    private readonly service: WorkingDaysService,
    private readonly resolver: WorkingDayResolutionService,
  ) {}

  @Get()
  @RequirePermissions(CalendarPermissions.WORKING_DAYS_READ)
  @ApiOkResponse({ type: WorkingDaysConfigurationListResponseDto })
  public async list(
    @Query() query: WorkingDaysQueryDto,
  ): Promise<WorkingDaysConfigurationListResponseDto> {
    const items = await this.service.listForBranch({
      branchId: query.branchId ?? null,
      date: query.date,
    });
    return { items: items.map(WorkingDaysConfigurationResponseDto.from) };
  }

  @Get('resolve')
  @RequirePermissions(CalendarPermissions.WORKING_DAYS_READ)
  @ApiOkResponse({ type: WorkingDayResolutionResponseDto })
  public async resolve(
    @Query() query: WorkingDaysResolveQueryDto,
  ): Promise<WorkingDayResolutionResponseDto> {
    const r = await this.resolver.resolve({
      branchId: query.branchId ?? null,
      date: query.date,
    });
    return WorkingDayResolutionResponseDto.from(r);
  }

  @Put()
  @RequirePermissions(CalendarPermissions.WORKING_DAYS_UPDATE)
  @ApiOkResponse({ type: WorkingDaysConfigurationResponseDto })
  public async upsert(
    @Body() body: UpsertWorkingDaysDto,
  ): Promise<WorkingDaysConfigurationResponseDto> {
    const row = await this.service.upsertPattern({
      branchId: body.branchId,
      dayOfWeek: body.dayOfWeek,
      isWorking: body.isWorking,
      sessionType: body.sessionType,
      effectiveFrom: body.effectiveFrom,
      note: body.note,
    });
    return WorkingDaysConfigurationResponseDto.from(row);
  }
}
