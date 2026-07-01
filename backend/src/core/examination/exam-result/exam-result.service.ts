/**
 * ExamResultService — idempotent compute of `ExamResult` + `ExamSubjectResult`.
 *
 * `POST /exams/:examId/results/compute` reads every active mark for the exam,
 * groups by student, applies the scheme's grade bands, and writes a fresh set
 * of result rows in one transaction. Re-running the endpoint replaces the
 * previous set (soft-delete + create) so the operation is idempotent in
 * outcome. The global `Idempotency-Key` middleware additionally guards
 * against duplicate HTTP calls.
 *
 * Compute rules (Sprint 8):
 *   - For each (student, subject), use the matching `ExamMarks` row.
 *   - Max marks per subject: `ExamSchedule.maxMarks` for the (subject, section),
 *     falling back to `Exam.defaultMaxMarks` when no schedule row exists.
 *   - Subject percentage = `(marksObtained / maxMarks) * 100`; null when absent.
 *   - Subject pass-fail = `marksObtained >= schedule.passMarks` (or
 *     `Exam.defaultPassMarks` when no schedule row). Absent counts as not-passed.
 *   - Exam total = sum(marksObtained), exam max = sum(maxMarks), exam pct =
 *     (total / max) * 100.
 *   - Exam pass-fail: PASSED iff student has marks for at least one subject AND
 *     passes every non-absent subject AND percentage >= scheme.passingPct.
 *     A student with zero marks rows is excluded from the compute output
 *     entirely (no result row written).
 *   - Grade letter: looked up in the scheme bands by percentage, in band
 *     ordering. First band whose `minPct <= pct <= maxPct` wins. Absent
 *     students get `gradeLetter = null`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  ExaminationFeatureFlags,
  ExaminationOutboxTopics,
} from '../examination.constants';
import {
  ExamNotFoundError,
  ExamResultNotFoundError,
  ExamSchemeNotFoundError,
  ExaminationModuleDisabledError,
} from '../examination.errors';
import type {
  ExamMarksRow,
  ExamResultWithSubjects,
  ExamScheduleRow,
  ExamSchemeBandRow,
  ExamSchemeWithBands,
} from '../examination.types';
import { ExamDefinitionRepository } from '../exam-definition/exam-definition.repository';
import { ExamMarksRepository } from '../exam-marks/exam-marks.repository';
import { ExamScheduleRepository } from '../exam-schedule/exam-schedule.repository';
import { ExamSchemeRepository } from '../exam-scheme/exam-scheme.repository';
import {
  ExamResultRepository,
  type ComputedResultInput,
  type ComputedSubjectInput,
} from './exam-result.repository';

export interface ResultListArgs {
  readonly sectionId?: string;
  readonly studentId?: string;
}

export interface ComputeSummary {
  readonly examId: string;
  readonly resultCount: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly results: readonly ExamResultWithSubjects[];
}

@Injectable()
export class ExamResultService {
  private readonly logger = new Logger(ExamResultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExamResultRepository,
    private readonly examRepo: ExamDefinitionRepository,
    private readonly schemeRepo: ExamSchemeRepository,
    private readonly scheduleRepo: ExamScheduleRepository,
    private readonly marksRepo: ExamMarksRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    examId: string,
    args: ResultListArgs,
  ): Promise<readonly ExamResultWithSubjects[]> {
    await this.assertModuleEnabled();
    return this.repo.listByExam(examId, {
      ...(args.sectionId !== undefined ? { sectionId: args.sectionId } : {}),
      ...(args.studentId !== undefined ? { studentId: args.studentId } : {}),
    });
  }

  public async getByStudent(
    examId: string,
    studentId: string,
  ): Promise<ExamResultWithSubjects> {
    await this.assertModuleEnabled();
    const row = await this.repo.findByStudent(examId, studentId);
    if (row === null) throw new ExamResultNotFoundError(`${examId}:${studentId}`);
    return row;
  }

  public async compute(examId: string): Promise<ComputeSummary> {
    await this.assertModuleEnabled();
    const ctx = RequestContextRegistry.require();
    const userId = ctx.userId ?? null;

    return this.prisma.transaction(async (tx) => {
      const exam = await this.examRepo.findById(examId, tx);
      if (exam === null) throw new ExamNotFoundError(examId);

      const scheme = await this.schemeRepo.findById(exam.examSchemeId, tx);
      if (scheme === null) throw new ExamSchemeNotFoundError(exam.examSchemeId);

      const marks = await this.marksRepo.list({ examId }, tx);
      const schedules = await this.scheduleRepo.list({ examId }, tx);

      const computed = this.buildComputedResults(
        marks,
        schedules,
        scheme,
        exam.defaultMaxMarks,
        exam.defaultPassMarks,
        userId,
      );

      const persisted = await this.repo.replaceForExam(examId, computed, tx);

      const passCount = persisted.filter((r) => r.isPassed).length;
      const failCount = persisted.length - passCount;

      await this.outbox.publish(tx, {
        topic: ExaminationOutboxTopics.RESULT_COMPUTED,
        eventType: 'ExamResultComputed',
        aggregateType: 'Exam',
        aggregateId: examId,
        payload: {
          examId,
          resultCount: persisted.length,
          passCount,
          failCount,
        },
      });

      await this.audit.record(
        {
          action: 'exam_result.compute',
          category: 'general',
          resourceType: 'Exam',
          resourceId: examId,
          after: {
            examId,
            resultCount: persisted.length,
            passCount,
            failCount,
          } as unknown as Record<string, unknown>,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Computed results examId=${examId} count=${persisted.length} pass=${passCount} fail=${failCount}.`,
      );

      return {
        examId,
        resultCount: persisted.length,
        passCount,
        failCount,
        results: persisted,
      };
    });
  }

  // ---------------------------------------------------------------------
  // Compute math
  // ---------------------------------------------------------------------

  private buildComputedResults(
    marks: readonly ExamMarksRow[],
    schedules: readonly ExamScheduleRow[],
    scheme: ExamSchemeWithBands,
    defaultMaxMarks: number,
    defaultPassMarks: number,
    userId: string | null,
  ): readonly ComputedResultInput[] {
    if (marks.length === 0) return [];

    // (subjectId, sectionId) -> schedule
    const scheduleKey = (subjectId: string, sectionId: string) =>
      `${subjectId}::${sectionId}`;
    const scheduleBySlot = new Map<string, ExamScheduleRow>();
    for (const s of schedules) {
      scheduleBySlot.set(scheduleKey(s.subjectId, s.sectionId), s);
    }

    // studentId -> { sectionId, marks[] }
    const byStudent = new Map<
      string,
      { sectionId: string; rows: ExamMarksRow[] }
    >();
    for (const m of marks) {
      const bucket = byStudent.get(m.studentId) ?? {
        sectionId: m.sectionId,
        rows: [],
      };
      bucket.rows.push(m);
      byStudent.set(m.studentId, bucket);
    }

    const now = new Date();
    const out: ComputedResultInput[] = [];
    for (const [studentId, { sectionId, rows }] of byStudent.entries()) {
      const subjects: ComputedSubjectInput[] = [];
      let totalObtained = 0;
      let totalMax = 0;
      let everyPresentSubjectPassed = true;
      let hasAnyPresentSubject = false;

      for (const m of rows) {
        const schedule = scheduleBySlot.get(scheduleKey(m.subjectId, m.sectionId));
        const maxMarks = schedule?.maxMarks ?? defaultMaxMarks;
        const passMarks = schedule?.passMarks ?? defaultPassMarks;

        let pct: number | null = null;
        let isPassed = false;
        let gradeLetter: string | null = null;
        let gradePoint: number | null = null;

        if (!m.isAbsent && m.marksObtained !== null) {
          hasAnyPresentSubject = true;
          pct = maxMarks === 0 ? 0 : (m.marksObtained / maxMarks) * 100;
          isPassed = m.marksObtained >= passMarks;
          if (!isPassed) everyPresentSubjectPassed = false;
          const band = lookupBand(scheme.bands, pct);
          gradeLetter = band?.gradeLetter ?? null;
          gradePoint = band?.gradePoint ?? null;
          totalObtained += m.marksObtained;
          totalMax += maxMarks;
        } else {
          everyPresentSubjectPassed = false;
          totalMax += maxMarks;
        }

        subjects.push({
          subjectId: m.subjectId,
          marksObtained: m.isAbsent ? null : m.marksObtained,
          maxMarks,
          percentage: pct === null ? null : round2(pct),
          isAbsent: m.isAbsent,
          isPassed,
          gradeLetter,
          gradePoint,
        });
      }

      const percentage = totalMax === 0 ? 0 : (totalObtained / totalMax) * 100;
      const meetsSchemePass = percentage >= scheme.passingPct;
      const isPassed =
        hasAnyPresentSubject && everyPresentSubjectPassed && meetsSchemePass;
      const band = lookupBand(scheme.bands, percentage);

      out.push({
        studentId,
        sectionId,
        totalMarksObtained: round2(totalObtained),
        totalMaxMarks: round2(totalMax),
        percentage: round2(percentage),
        gradeLetter: band?.gradeLetter ?? null,
        gradePoint: band?.gradePoint ?? null,
        status: 'COMPUTED',
        isPassed,
        computedAt: now,
        computedBy: userId,
        subjects,
      });
    }

    return out;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ExaminationFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new ExaminationModuleDisabledError();
  }
}

function lookupBand(
  bands: readonly ExamSchemeBandRow[],
  pct: number,
): ExamSchemeBandRow | null {
  for (const b of bands) {
    if (pct >= b.minPct && pct <= b.maxPct) return b;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const __test__ = { lookupBand, round2 };
