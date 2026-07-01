/**
 * AttendanceStatusHistoryService — thin wrapper for the append-only
 * `attendance_status_history` table. The actual `append()` call belongs
 * inside whichever transaction is mutating `AttendanceDaily`; this
 * service exists for the read endpoint and (optionally) for callers that
 * want to record system-initiated changes outside the standard mutators.
 */
import { Injectable } from '@nestjs/common';

import type { AttendanceStatusHistoryRow } from '../attendance.types';
import { AttendanceStatusHistoryRepository } from './status-history.repository';

@Injectable()
export class AttendanceStatusHistoryService {
  constructor(private readonly repo: AttendanceStatusHistoryRepository) {}

  public async listForAttendance(
    attendanceDailyId: string,
  ): Promise<readonly AttendanceStatusHistoryRow[]> {
    return this.repo.listForAttendance(attendanceDailyId);
  }
}
