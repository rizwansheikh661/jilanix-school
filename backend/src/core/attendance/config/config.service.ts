/**
 * AttendanceConfigService — thin orchestration over
 * `AttendanceConfigRepository`. The repo owns the optimistic-concurrency
 * upsert; this layer wraps it in a transaction so the audit row + outbox
 * event (added in a later sprint) can share the same tx.
 *
 * Effective config resolution (`getEffective`) is also exposed here so
 * downstream services (student-attendance, lock-window) can resolve the
 * `editWindowHours` / `lateThresholdMinutes` / `holidayAutoMark` for a
 * given branch without poking at the repo directly.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import {
  ATTENDANCE_DEFAULT_EDIT_WINDOW_HOURS,
  ATTENDANCE_DEFAULT_LATE_THRESHOLD_MINUTES,
  type AttendanceSourceValue,
} from '../attendance.constants';
import type { AttendanceConfigRow } from '../attendance.types';
import {
  AttendanceConfigRepository,
  type UpsertAttendanceConfigInput,
} from './config.repository';

export interface EffectiveAttendanceConfig {
  readonly editWindowHours: number;
  readonly lateThresholdMinutes: number;
  readonly correctionsRequireApproval: boolean;
  readonly allowedSources: readonly AttendanceSourceValue[];
  readonly holidayAutoMark: boolean;
}

const DEFAULTS: EffectiveAttendanceConfig = Object.freeze({
  editWindowHours: ATTENDANCE_DEFAULT_EDIT_WINDOW_HOURS,
  lateThresholdMinutes: ATTENDANCE_DEFAULT_LATE_THRESHOLD_MINUTES,
  correctionsRequireApproval: true,
  allowedSources: ['MANUAL'] as readonly AttendanceSourceValue[],
  holidayAutoMark: true,
});

@Injectable()
export class AttendanceConfigService {
  private readonly logger = new Logger(AttendanceConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AttendanceConfigRepository,
    private readonly audit: AuditService,
  ) {}

  public async list(): Promise<readonly AttendanceConfigRow[]> {
    return this.repo.listAll();
  }

  public async getForBranch(branchId: string | null): Promise<AttendanceConfigRow | null> {
    return this.repo.findForBranch(branchId);
  }

  /**
   * Returns the resolved values used by other services: branch row if
   * present, then school-wide row, then module defaults.
   */
  public async getEffective(
    branchId: string | null,
    tx?: PrismaTx,
  ): Promise<EffectiveAttendanceConfig> {
    const row = await this.repo.findEffective(branchId, tx);
    if (row === null) return DEFAULTS;
    return {
      editWindowHours: row.editWindowHours,
      lateThresholdMinutes: row.lateThresholdMinutes,
      correctionsRequireApproval: row.correctionsRequireApproval,
      allowedSources: row.allowedSources,
      holidayAutoMark: row.holidayAutoMark,
    };
  }

  public async upsert(input: UpsertAttendanceConfigInput): Promise<AttendanceConfigRow> {
    return this.prisma.transaction(async (tx) => {
      const before = await this.repo.findForBranch(input.branchId, tx);
      const after = await this.repo.upsert(input, tx);
      await this.audit.record(
        {
          action: 'attendance_config.upsert',
          category: 'general',
          resourceType: 'AttendanceConfig',
          resourceId: after.id,
          before,
          after,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `AttendanceConfig upserted id=${after.id} branchId=${after.branchId ?? 'null'} v=${after.version}.`,
      );
      return after;
    });
  }
}
