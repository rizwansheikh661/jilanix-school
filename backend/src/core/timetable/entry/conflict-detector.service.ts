/**
 * TimetableConflictDetectorService — pre-flight validation + full-scan
 * pass that writes append-only ledger rows.
 *
 * Two entry points:
 *   - `validate(input, tx)` — called by the entry write pipeline before
 *     a single create/update. Throws the first matching domain error so
 *     the caller sees a precise 409. Does NOT write ledger rows (the
 *     write hasn't happened yet).
 *   - `scanVersion(versionId, tx)` — re-checks every entry in a version
 *     against every gate; each violation is recorded in
 *     `TimetableConflict`. Used by ops/admin views and end-of-edit
 *     "is my draft clean?" UX. Returns the count + grouped breakdown.
 *
 * Gate inventory (plan §7.4):
 *   1. WORKING_DAY: branch + dayOfWeek must resolve to isWorking=true.
 *   2. PERIOD_IN_TEMPLATE: periodIndex must exist and be TEACHING.
 *   3. SECTION_DOUBLE_BOOKED, TEACHER_DOUBLE_BOOKED, ROOM_DOUBLE_BOOKED.
 *   4. TEACHER_NOT_QUALIFIED: StaffSubjectQualification row must exist
 *      (bypassed when `timetable.allow_unqualified_teacher` is on).
 *   5. ROOM_DISALLOWED_TYPE: RoomType.allowsTimetable must be true.
 *   6. TEACHER_UNAVAILABLE: no UNAVAILABLE availability row covers slot.
 *
 * The CROSS_SCHOOL guard lives on the entry service (FK loads happen
 * there). This detector trusts that the IDs it receives belong to the
 * current tenant.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { WorkingDayResolutionService } from '../../calendar/calendar.service';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequestContextRegistry } from '../../request-context';
import { TimetableFeatureFlags, type TimetableConflictTypeValue } from '../timetable.constants';
import {
  NonWorkingDayError,
  PeriodOutOfTemplateError,
  RoomDisallowedTypeError,
  RoomDoubleBookedError,
  SectionDoubleBookedError,
  TeacherDoubleBookedError,
  TeacherNotQualifiedError,
  TeacherUnavailableError,
  TimetableVersionNotFoundError,
} from '../timetable.errors';
import { PeriodTemplateRepository } from '../period-template/period-template.repository';
import { TimetableVersionRepository } from '../version/version.repository';
import { TeacherAvailabilityService } from '../availability/availability.service';
import { TimetableEntryRepository } from './entry.repository';
import { TimetableConflictRepository } from './conflict.repository';

export interface ValidateEntryInput {
  readonly timetableVersionId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly staffId: string;
  readonly roomId: string | null;
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  /** When updating, the existing entry id to exclude from dup checks. */
  readonly excludeEntryId?: string;
}

export interface ScanVersionResult {
  readonly versionId: string;
  readonly totalEntries: number;
  readonly conflictsCreated: number;
  readonly byType: Readonly<Record<TimetableConflictTypeValue, number>>;
}

@Injectable()
export class TimetableConflictDetectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versionRepo: TimetableVersionRepository,
    private readonly templateRepo: PeriodTemplateRepository,
    private readonly entryRepo: TimetableEntryRepository,
    private readonly conflictRepo: TimetableConflictRepository,
    private readonly workingDay: WorkingDayResolutionService,
    private readonly availability: TeacherAvailabilityService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  public async validate(input: ValidateEntryInput, tx?: PrismaTx): Promise<void> {
    const version = await this.versionRepo.findById(input.timetableVersionId, tx);
    if (version === null) throw new TimetableVersionNotFoundError(input.timetableVersionId);

    // 1. PERIOD_IN_TEMPLATE
    const period = await this.templateRepo.findPeriodByIndex(
      version.periodTemplateId,
      input.periodIndex,
      tx,
    );
    if (period === null) {
      throw new PeriodOutOfTemplateError(
        `periodIndex ${input.periodIndex} does not exist in template`,
        {
          dayOfWeek: input.dayOfWeek,
          periodIndex: input.periodIndex,
          templateId: version.periodTemplateId,
        },
      );
    }
    if (period.type !== 'TEACHING') {
      throw new PeriodOutOfTemplateError(`period is type=${period.type}, not TEACHING`, {
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        templateId: version.periodTemplateId,
      });
    }

    // 2. WORKING_DAY (calendar resolution against version's branch).
    const repDate = pickRepresentativeDate(
      version.effectiveFrom,
      version.effectiveTo,
      input.dayOfWeek,
    );
    const resolution = await this.workingDay.resolve({
      branchId: version.branchId,
      date: repDate,
    });
    if (!resolution.isWorking) {
      throw new NonWorkingDayError(input.dayOfWeek, version.branchId);
    }

    // 3. SECTION_DOUBLE_BOOKED
    const sectionDup = await this.entryRepo.findActiveBySectionSlot(
      input.timetableVersionId,
      input.sectionId,
      input.dayOfWeek,
      input.periodIndex,
      tx,
    );
    if (sectionDup !== null && sectionDup.id !== input.excludeEntryId) {
      throw new SectionDoubleBookedError({
        versionId: input.timetableVersionId,
        sectionId: input.sectionId,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        existingEntryId: sectionDup.id,
      });
    }

    // 4. TEACHER_DOUBLE_BOOKED
    const teacherDup = await this.entryRepo.findActiveByStaffSlot(
      input.timetableVersionId,
      input.staffId,
      input.dayOfWeek,
      input.periodIndex,
      tx,
    );
    if (teacherDup !== null && teacherDup.id !== input.excludeEntryId) {
      throw new TeacherDoubleBookedError({
        versionId: input.timetableVersionId,
        staffId: input.staffId,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        existingEntryId: teacherDup.id,
      });
    }

    // 5. ROOM_DOUBLE_BOOKED + ROOM_DISALLOWED_TYPE
    if (input.roomId !== null) {
      const roomDup = await this.entryRepo.findActiveByRoomSlot(
        input.timetableVersionId,
        input.roomId,
        input.dayOfWeek,
        input.periodIndex,
        tx,
      );
      if (roomDup !== null && roomDup.id !== input.excludeEntryId) {
        throw new RoomDoubleBookedError({
          versionId: input.timetableVersionId,
          roomId: input.roomId,
          dayOfWeek: input.dayOfWeek,
          periodIndex: input.periodIndex,
          existingEntryId: roomDup.id,
        });
      }
      await this.assertRoomAllowsTimetable(input.roomId, tx);
    }

    // 6. TEACHER_NOT_QUALIFIED (bypassable by flag)
    const allowUnqualified = await this.featureFlags.isEnabled(
      TimetableFeatureFlags.ALLOW_UNQUALIFIED_TEACHER,
      { schoolId: this.requireSchoolId() },
    );
    if (!allowUnqualified) {
      await this.assertTeacherQualified(input.staffId, input.subjectId, tx);
    }

    // 7. TEACHER_UNAVAILABLE
    const ok = await this.availability.isAvailable(
      {
        staffId: input.staffId,
        academicYearId: version.academicYearId,
        dayOfWeek: input.dayOfWeek,
        periodIndex: input.periodIndex,
        onDate: repDate,
      },
      tx,
    );
    if (!ok) {
      throw new TeacherUnavailableError(
        input.staffId,
        input.dayOfWeek,
        input.periodIndex,
      );
    }
  }

  public async scanVersion(versionId: string, tx?: PrismaTx): Promise<ScanVersionResult> {
    const exec = async (txInner: PrismaTx): Promise<ScanVersionResult> => {
      const version = await this.versionRepo.findById(versionId, txInner);
      if (version === null) throw new TimetableVersionNotFoundError(versionId);
      const entries = await this.entryRepo.findActiveForVersion(versionId, txInner);
      const byType: Record<TimetableConflictTypeValue, number> = {
        TEACHER_DOUBLE_BOOKED: 0,
        ROOM_DOUBLE_BOOKED: 0,
        SECTION_DOUBLE_BOOKED: 0,
        TEACHER_NOT_QUALIFIED: 0,
        ROOM_DISALLOWED_TYPE: 0,
        PERIOD_OUT_OF_TEMPLATE: 0,
        NON_WORKING_DAY: 0,
        TEACHER_UNAVAILABLE: 0,
      };
      let created = 0;

      for (const entry of entries) {
        try {
          await this.validate(
            {
              timetableVersionId: entry.timetableVersionId,
              sectionId: entry.sectionId,
              subjectId: entry.subjectId,
              staffId: entry.staffId,
              roomId: entry.roomId,
              dayOfWeek: entry.dayOfWeek,
              periodIndex: entry.periodIndex,
              excludeEntryId: entry.id,
            },
            txInner,
          );
        } catch (err) {
          const type = errorToType(err);
          if (type === null) throw err;
          byType[type] += 1;
          created += 1;
          await this.conflictRepo.create(
            {
              timetableVersionId: versionId,
              type,
              contextJson: {
                entryId: entry.id,
                sectionId: entry.sectionId,
                staffId: entry.staffId,
                roomId: entry.roomId,
                dayOfWeek: entry.dayOfWeek,
                periodIndex: entry.periodIndex,
                message: err instanceof Error ? err.message : String(err),
              },
              entryAId: entry.id,
              entryBId: extractOtherEntryId(err),
            },
            txInner,
          );
        }
      }
      return {
        versionId,
        totalEntries: entries.length,
        conflictsCreated: created,
        byType,
      };
    };
    if (tx !== undefined) return exec(tx);
    return this.prisma.transaction(exec);
  }

  private async assertRoomAllowsTimetable(roomId: string, tx?: PrismaTx): Promise<void> {
    const reader = (tx ?? (this.prisma.client as unknown as PrismaTx)) as PrismaTx;
    const schoolId = this.requireSchoolId();
    const room = await reader.room.findUnique({
      where: { schoolId_id: { schoolId, id: roomId } },
      include: { roomType: true },
    });
    if (room === null) return;
    if (room.roomType !== null && room.roomType.allowsTimetable === false) {
      throw new RoomDisallowedTypeError(roomId, room.roomType.id);
    }
  }

  private async assertTeacherQualified(
    staffId: string,
    subjectId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const reader = (tx ?? (this.prisma.client as unknown as PrismaTx)) as PrismaTx;
    const schoolId = this.requireSchoolId();
    const qual = await reader.staffSubjectQualification.findUnique({
      where: {
        schoolId_staffId_subjectId: { schoolId, staffId, subjectId },
      },
    });
    if (qual === null) {
      throw new TeacherNotQualifiedError(staffId, subjectId);
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('TimetableConflictDetectorService requires tenant scope.');
    }
    return ctx.schoolId;
  }
}

function pickRepresentativeDate(
  from: Date,
  to: Date | null,
  targetDow: number,
): Date {
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 86_400_000);
    if (toIsoDow(candidate) === targetDow) {
      if (to === null || candidate.getTime() <= to.getTime()) return candidate;
      return candidate;
    }
  }
  return start;
}

function toIsoDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

function errorToType(err: unknown): TimetableConflictTypeValue | null {
  if (err instanceof SectionDoubleBookedError) return 'SECTION_DOUBLE_BOOKED';
  if (err instanceof TeacherDoubleBookedError) return 'TEACHER_DOUBLE_BOOKED';
  if (err instanceof RoomDoubleBookedError) return 'ROOM_DOUBLE_BOOKED';
  if (err instanceof TeacherNotQualifiedError) return 'TEACHER_NOT_QUALIFIED';
  if (err instanceof RoomDisallowedTypeError) return 'ROOM_DISALLOWED_TYPE';
  if (err instanceof PeriodOutOfTemplateError) return 'PERIOD_OUT_OF_TEMPLATE';
  if (err instanceof NonWorkingDayError) return 'NON_WORKING_DAY';
  if (err instanceof TeacherUnavailableError) return 'TEACHER_UNAVAILABLE';
  return null;
}

function extractOtherEntryId(err: unknown): string | null {
  if (err instanceof SectionDoubleBookedError) return err.slot.existingEntryId;
  if (err instanceof TeacherDoubleBookedError) return err.slot.existingEntryId;
  if (err instanceof RoomDoubleBookedError) return err.slot.existingEntryId;
  return null;
}
