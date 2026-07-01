/**
 * Examination module constants — permission keys, outbox topics, feature
 * flag keys, and shared enum value tuples. Imported by every sub-module.
 *
 * Sprint 8 ships the foundation: schemes, exams, schedule, marks (with
 * append-only history + edit-window + optimistic-lock), and results
 * computed by an idempotent POST /compute endpoint.
 */

export const ExaminationPermissions = {
  // Exam Scheme
  SCHEME_READ: 'exam-scheme.read',
  SCHEME_CREATE: 'exam-scheme.create',
  SCHEME_UPDATE: 'exam-scheme.update',
  SCHEME_DELETE: 'exam-scheme.delete',
  // Exam Definition
  EXAM_READ: 'exam.read',
  EXAM_CREATE: 'exam.create',
  EXAM_UPDATE: 'exam.update',
  EXAM_DELETE: 'exam.delete',
  EXAM_PUBLISH: 'exam.publish',
  EXAM_ARCHIVE: 'exam.archive',
  // Exam Schedule
  SCHEDULE_READ: 'exam-schedule.read',
  SCHEDULE_CREATE: 'exam-schedule.create',
  SCHEDULE_UPDATE: 'exam-schedule.update',
  SCHEDULE_DELETE: 'exam-schedule.delete',
  SCHEDULE_BULK: 'exam-schedule.bulk',
  // Marks Entry
  MARKS_READ: 'exam-marks.read',
  MARKS_CREATE: 'exam-marks.create',
  MARKS_UPDATE: 'exam-marks.update',
  MARKS_DELETE: 'exam-marks.delete',
  MARKS_BULK: 'exam-marks.bulk',
  // Marks History
  MARKS_HISTORY_READ: 'exam-marks.history.read',
  // Results
  RESULT_READ: 'exam-result.read',
  RESULT_COMPUTE: 'exam-result.compute',
  RESULT_LIST: 'exam-result.list',
} as const;

export type ExaminationPermission =
  (typeof ExaminationPermissions)[keyof typeof ExaminationPermissions];

export const EXAMINATION_PERMISSION_DESCRIPTIONS: Readonly<
  Record<ExaminationPermission, string>
> = Object.freeze({
  [ExaminationPermissions.SCHEME_READ]: 'List or read exam grading schemes.',
  [ExaminationPermissions.SCHEME_CREATE]: 'Create a new exam scheme with grade bands.',
  [ExaminationPermissions.SCHEME_UPDATE]: 'Update an exam scheme; replacing bands replaces the set.',
  [ExaminationPermissions.SCHEME_DELETE]: 'Soft-delete an exam scheme; refused if a non-archived exam references it.',
  [ExaminationPermissions.EXAM_READ]: 'List or read exam definitions.',
  [ExaminationPermissions.EXAM_CREATE]: 'Create a DRAFT exam with class/section maps.',
  [ExaminationPermissions.EXAM_UPDATE]: 'Update an exam definition while in DRAFT.',
  [ExaminationPermissions.EXAM_DELETE]: 'Soft-delete a DRAFT exam.',
  [ExaminationPermissions.EXAM_PUBLISH]: 'Publish an exam (DRAFT → PUBLISHED).',
  [ExaminationPermissions.EXAM_ARCHIVE]: 'Archive an exam (PUBLISHED → ARCHIVED).',
  [ExaminationPermissions.SCHEDULE_READ]: 'List or read exam schedule rows.',
  [ExaminationPermissions.SCHEDULE_CREATE]: 'Create a single exam schedule row.',
  [ExaminationPermissions.SCHEDULE_UPDATE]: 'Update an exam schedule row.',
  [ExaminationPermissions.SCHEDULE_DELETE]: 'Soft-delete an exam schedule row.',
  [ExaminationPermissions.SCHEDULE_BULK]: 'Bulk-create exam schedule rows (\u2264200 per request).',
  [ExaminationPermissions.MARKS_READ]: 'Read a (section, subject) marks matrix.',
  [ExaminationPermissions.MARKS_CREATE]: 'Enter marks for a single student/subject.',
  [ExaminationPermissions.MARKS_UPDATE]: 'Update marks within the edit window.',
  [ExaminationPermissions.MARKS_DELETE]: 'Soft-delete a marks row.',
  [ExaminationPermissions.MARKS_BULK]: 'Bulk replace marks for a (section, subject) (\u2264500 entries).',
  [ExaminationPermissions.MARKS_HISTORY_READ]: 'Read the append-only marks edit history ledger.',
  [ExaminationPermissions.RESULT_READ]: 'Read a single student\u2019s exam result.',
  [ExaminationPermissions.RESULT_COMPUTE]: 'Trigger idempotent computation of exam results.',
  [ExaminationPermissions.RESULT_LIST]: 'List computed exam results for an exam.',
});

export const ExaminationFeatureFlags = {
  MODULE: 'module.examination',
  ALLOW_OVERSCORE: 'examination.allow_overscore',
  RECOMPUTE_ON_MARKS_CHANGE: 'examination.recompute_on_marks_change',
  PUBLISH_RESULTS: 'examination.publish_results',
} as const;

export const ExaminationOutboxTopics = {
  SCHEME_CREATED: 'examination.scheme.created',
  SCHEME_UPDATED: 'examination.scheme.updated',
  SCHEME_DELETED: 'examination.scheme.deleted',

  EXAM_CREATED: 'examination.exam.created',
  EXAM_UPDATED: 'examination.exam.updated',
  EXAM_PUBLISHED: 'examination.exam.published',
  EXAM_ARCHIVED: 'examination.exam.archived',
  EXAM_DELETED: 'examination.exam.deleted',

  SCHEDULE_CREATED: 'examination.schedule.created',
  SCHEDULE_UPDATED: 'examination.schedule.updated',
  SCHEDULE_DELETED: 'examination.schedule.deleted',
  SCHEDULE_BULK_CREATED: 'examination.schedule.bulk_created',

  MARKS_ENTERED: 'examination.marks.entered',
  MARKS_UPDATED: 'examination.marks.updated',
  MARKS_DELETED: 'examination.marks.deleted',
  MARKS_BULK_UPDATED: 'examination.marks.bulk_updated',

  RESULT_COMPUTED: 'examination.result.computed',
  RESULT_PUBLISHED: 'examination.result.published',
} as const;

export const EXAM_TYPE_VALUES = [
  'UNIT_TEST',
  'MONTHLY_TEST',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
  'PRE_BOARD',
  'OTHER',
] as const;
export type ExamTypeValue = (typeof EXAM_TYPE_VALUES)[number];

export const EXAM_STATUS_VALUES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ExamStatusValue = (typeof EXAM_STATUS_VALUES)[number];

export const EXAM_RESULT_STATUS_VALUES = ['PENDING', 'COMPUTED', 'PUBLISHED'] as const;
export type ExamResultStatusValue = (typeof EXAM_RESULT_STATUS_VALUES)[number];

export const EXAM_MARKS_CHANGE_TYPE_VALUES = [
  'ENTERED',
  'EDITED',
  'DELETED',
  'RESTORED',
  'RECOMPUTED',
  'CORRECTED',
] as const;
export type ExamMarksChangeTypeValue = (typeof EXAM_MARKS_CHANGE_TYPE_VALUES)[number];

/** Bulk schedule rows hard cap. Plan §service-level rule 14. */
export const EXAM_SCHEDULE_BULK_MAX = 200;

/** Bulk marks entries hard cap (one section x one subject). */
export const EXAM_MARKS_BULK_MAX = 500;

/** Default edit window on ExamScheme when caller omits the field. */
export const EXAM_MARKS_DEFAULT_EDIT_WINDOW_DAYS = 14;

/** Max bands per ExamScheme — protects the band-validator from runaway input. */
export const EXAM_SCHEME_MAX_BANDS = 20;
