import { Module } from '@nestjs/common';

import { CalendarPermissionsSeeder } from './calendar-permissions.seeder';
import {
  CalendarEventController,
  HolidayController,
  WorkingDaysController,
} from './calendar.controller';
import {
  CalendarEventService,
  HolidayService,
  WorkingDayResolutionService,
  WorkingDaysService,
} from './calendar.service';
import { CalendarEventRepository } from './repositories/calendar-event.repository';
import { HolidayRepository } from './repositories/holiday.repository';
import { WorkingDaysConfigurationRepository } from './repositories/working-days.repository';

@Module({
  controllers: [HolidayController, CalendarEventController, WorkingDaysController],
  providers: [
    HolidayRepository,
    CalendarEventRepository,
    WorkingDaysConfigurationRepository,
    HolidayService,
    CalendarEventService,
    WorkingDaysService,
    WorkingDayResolutionService,
    CalendarPermissionsSeeder,
  ],
  exports: [
    HolidayService,
    CalendarEventService,
    WorkingDaysService,
    WorkingDayResolutionService,
    HolidayRepository,
    CalendarEventRepository,
    WorkingDaysConfigurationRepository,
  ],
})
export class CalendarModule {}
