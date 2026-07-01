import { ERROR_CODES } from '../../contracts/api';
import { DomainError } from '../errors/domain-error';

export type CalendarErrorReason =
  | 'holiday_collision'
  | 'half_day_session_required'
  | 'calendar_event_time_required'
  | 'calendar_event_end_before_start';

export class CalendarError extends DomainError {
  public override readonly name: string = 'CalendarError';
}

export class HolidayCollisionError extends CalendarError {
  public override readonly name = 'HolidayCollisionError';
  constructor(args: { schoolId: string; branchId: string | null; date: string }) {
    super({
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      message: `A holiday already exists on ${args.date} for the same scope.`,
      details: {
        reason: 'holiday_collision' satisfies CalendarErrorReason,
        ...args,
      },
    });
  }
}

export class HalfDaySessionRequiredError extends CalendarError {
  public override readonly name = 'HalfDaySessionRequiredError';
  constructor() {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'halfDaySession is required when isFullDay is false.',
      details: { reason: 'half_day_session_required' satisfies CalendarErrorReason },
    });
  }
}

export class CalendarEventTimeRequiredError extends CalendarError {
  public override readonly name = 'CalendarEventTimeRequiredError';
  constructor() {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'startTime and endTime are required when allDay is false.',
      details: { reason: 'calendar_event_time_required' satisfies CalendarErrorReason },
    });
  }
}

export class CalendarEventEndBeforeStartError extends CalendarError {
  public override readonly name = 'CalendarEventEndBeforeStartError';
  constructor() {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'endDate must be on or after startDate.',
      details: { reason: 'calendar_event_end_before_start' satisfies CalendarErrorReason },
    });
  }
}
