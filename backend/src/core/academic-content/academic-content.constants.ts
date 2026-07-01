/**
 * Academic-content module constants — permission keys, feature flag keys,
 * outbox topics, notification event keys, shared enum value tuples, and
 * numeric/format guardrails.
 *
 * Sprint 12 ships the Homework, Assignments & Syllabus foundation:
 *   - Homework + HomeworkAttachment (lifecycle: DRAFT → PUBLISHED → CLOSED;
 *     CANCELLED from any non-terminal).
 *   - Assignment + AssignmentAttachment (same lifecycle + marks fields).
 *   - AssignmentSubmission + AssignmentSubmissionAttachment (teacher-mediated;
 *     SUBMITTED / LATE_SUBMITTED / EVALUATED / REJECTED). isLate computed at
 *     submission time (now >= dueDate). Rubric column reserved; AI eval
 *     deferred.
 *   - Syllabus + self-referencing SyllabusNode (UNIT → CHAPTER → TOPIC).
 *     Completion bubbles bottom-up in the same tx as the leaf update.
 *   - 7 notification event-key catalog entries registered with Sprint 10
 *     (audience=USER per Sprint 11 precedent; recipient resolution to be
 *     wired in the future Portal sprint — Module 10 "Parent Communication
 *     Foundation" in the user-spec).
 *   - 5 feature flags + 29 RBAC permission keys + 24 outbox topics.
 */

// ---------------------------------------------------------------------------
// Permissions — 29 keys.
// ---------------------------------------------------------------------------
export const AcademicContentPermissions = {
  // Homework (7)
  HOMEWORK_READ: 'homework.read',
  HOMEWORK_CREATE: 'homework.create',
  HOMEWORK_UPDATE: 'homework.update',
  HOMEWORK_DELETE: 'homework.delete',
  HOMEWORK_PUBLISH: 'homework.publish',
  HOMEWORK_CLOSE: 'homework.close',
  HOMEWORK_CANCEL: 'homework.cancel',
  // Homework attachment (3)
  HOMEWORK_ATTACHMENT_READ: 'homework-attachment.read',
  HOMEWORK_ATTACHMENT_CREATE: 'homework-attachment.create',
  HOMEWORK_ATTACHMENT_DELETE: 'homework-attachment.delete',
  // Assignment (7)
  ASSIGNMENT_READ: 'assignment.read',
  ASSIGNMENT_CREATE: 'assignment.create',
  ASSIGNMENT_UPDATE: 'assignment.update',
  ASSIGNMENT_DELETE: 'assignment.delete',
  ASSIGNMENT_PUBLISH: 'assignment.publish',
  ASSIGNMENT_CLOSE: 'assignment.close',
  ASSIGNMENT_CANCEL: 'assignment.cancel',
  // Assignment attachment (3)
  ASSIGNMENT_ATTACHMENT_READ: 'assignment-attachment.read',
  ASSIGNMENT_ATTACHMENT_CREATE: 'assignment-attachment.create',
  ASSIGNMENT_ATTACHMENT_DELETE: 'assignment-attachment.delete',
  // Assignment submission (4)
  SUBMISSION_READ: 'assignment-submission.read',
  SUBMISSION_CREATE: 'assignment-submission.create',
  SUBMISSION_EVALUATE: 'assignment-submission.evaluate',
  SUBMISSION_REJECT: 'assignment-submission.reject',
  // Syllabus (5)
  SYLLABUS_READ: 'syllabus.read',
  SYLLABUS_CREATE: 'syllabus.create',
  SYLLABUS_UPDATE: 'syllabus.update',
  SYLLABUS_DELETE: 'syllabus.delete',
  SYLLABUS_NODE_COMPLETE: 'syllabus.node-complete',
} as const;

export type AcademicContentPermission =
  (typeof AcademicContentPermissions)[keyof typeof AcademicContentPermissions];

export const ACADEMIC_CONTENT_PERMISSION_DESCRIPTIONS: Readonly<
  Record<AcademicContentPermission, string>
> = Object.freeze({
  [AcademicContentPermissions.HOMEWORK_READ]: 'List or read homework headers.',
  [AcademicContentPermissions.HOMEWORK_CREATE]: 'Create a DRAFT homework.',
  [AcademicContentPermissions.HOMEWORK_UPDATE]:
    'Update homework (free in DRAFT; dueDate/priority/instructions only after publish).',
  [AcademicContentPermissions.HOMEWORK_DELETE]:
    'Soft-delete homework; refused once PUBLISHED (cancel first).',
  [AcademicContentPermissions.HOMEWORK_PUBLISH]:
    'Transition DRAFT → PUBLISHED; dispatches HOMEWORK_PUBLISHED notification.',
  [AcademicContentPermissions.HOMEWORK_CLOSE]:
    'Transition PUBLISHED → CLOSED; dispatches HOMEWORK_CLOSED notification.',
  [AcademicContentPermissions.HOMEWORK_CANCEL]:
    'Cancel from any non-terminal state.',
  [AcademicContentPermissions.HOMEWORK_ATTACHMENT_READ]:
    'List or read attachments on a homework.',
  [AcademicContentPermissions.HOMEWORK_ATTACHMENT_CREATE]:
    'Upload an attachment (multipart) to a homework via FileAsset.',
  [AcademicContentPermissions.HOMEWORK_ATTACHMENT_DELETE]:
    'Soft-delete a homework attachment.',
  [AcademicContentPermissions.ASSIGNMENT_READ]:
    'List or read assignment headers.',
  [AcademicContentPermissions.ASSIGNMENT_CREATE]: 'Create a DRAFT assignment.',
  [AcademicContentPermissions.ASSIGNMENT_UPDATE]:
    'Update assignment (free in DRAFT; dueDate/description only after publish).',
  [AcademicContentPermissions.ASSIGNMENT_DELETE]:
    'Soft-delete assignment; refused once PUBLISHED (cancel first).',
  [AcademicContentPermissions.ASSIGNMENT_PUBLISH]:
    'Transition DRAFT → PUBLISHED; dispatches ASSIGNMENT_PUBLISHED notification.',
  [AcademicContentPermissions.ASSIGNMENT_CLOSE]:
    'Transition PUBLISHED → CLOSED.',
  [AcademicContentPermissions.ASSIGNMENT_CANCEL]:
    'Cancel from any non-terminal state.',
  [AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_READ]:
    'List or read attachments on an assignment.',
  [AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_CREATE]:
    'Upload an attachment (multipart) to an assignment via FileAsset.',
  [AcademicContentPermissions.ASSIGNMENT_ATTACHMENT_DELETE]:
    'Soft-delete an assignment attachment.',
  [AcademicContentPermissions.SUBMISSION_READ]:
    'List or read submissions on an assignment.',
  [AcademicContentPermissions.SUBMISSION_CREATE]:
    'Record a student submission on behalf of a student (teacher-mediated).',
  [AcademicContentPermissions.SUBMISSION_EVALUATE]:
    'Evaluate a submission (marks + remarks); dispatches ASSIGNMENT_EVALUATED.',
  [AcademicContentPermissions.SUBMISSION_REJECT]:
    'Reject a submission with a reason.',
  [AcademicContentPermissions.SYLLABUS_READ]:
    'List or read syllabus + node trees.',
  [AcademicContentPermissions.SYLLABUS_CREATE]:
    'Create a syllabus container (one active per academicYear+class+subject).',
  [AcademicContentPermissions.SYLLABUS_UPDATE]:
    'Update syllabus metadata (planned/actual dates, manual status override).',
  [AcademicContentPermissions.SYLLABUS_DELETE]:
    'Soft-delete a syllabus and cascade descendant nodes.',
  [AcademicContentPermissions.SYLLABUS_NODE_COMPLETE]:
    'Mark a syllabus node as completed; bubbles up parent + syllabus percent.',
});

// ---------------------------------------------------------------------------
// Feature flags — 5 keys.
// ---------------------------------------------------------------------------
export const AcademicContentFeatureFlags = {
  MODULE: 'module.academic-content',
  ALLOW_HOMEWORK_PUBLISH: 'academic-content.allow_homework_publish',
  ALLOW_ASSIGNMENT_PUBLISH: 'academic-content.allow_assignment_publish',
  ALLOW_SUBMISSIONS: 'academic-content.allow_submissions',
  NOTIFY_ON_LIFECYCLE: 'academic-content.notify_on_lifecycle',
} as const;

export type AcademicContentFeatureFlag =
  (typeof AcademicContentFeatureFlags)[keyof typeof AcademicContentFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics — 24 keys.
// ---------------------------------------------------------------------------
export const AcademicContentOutboxTopics = {
  // Homework
  HOMEWORK_CREATED: 'homework.created',
  HOMEWORK_UPDATED: 'homework.updated',
  HOMEWORK_PUBLISHED: 'homework.published',
  HOMEWORK_CLOSED: 'homework.closed',
  HOMEWORK_CANCELLED: 'homework.cancelled',
  HOMEWORK_DELETED: 'homework.deleted',
  HOMEWORK_ATTACHMENT_UPLOADED: 'homework.attachment.uploaded',
  HOMEWORK_ATTACHMENT_DELETED: 'homework.attachment.deleted',
  // Assignment
  ASSIGNMENT_CREATED: 'assignment.created',
  ASSIGNMENT_UPDATED: 'assignment.updated',
  ASSIGNMENT_PUBLISHED: 'assignment.published',
  ASSIGNMENT_CLOSED: 'assignment.closed',
  ASSIGNMENT_CANCELLED: 'assignment.cancelled',
  ASSIGNMENT_DELETED: 'assignment.deleted',
  ASSIGNMENT_ATTACHMENT_UPLOADED: 'assignment.attachment.uploaded',
  ASSIGNMENT_ATTACHMENT_DELETED: 'assignment.attachment.deleted',
  // Submission
  SUBMISSION_SUBMITTED: 'assignment.submission.submitted',
  SUBMISSION_EVALUATED: 'assignment.submission.evaluated',
  SUBMISSION_REJECTED: 'assignment.submission.rejected',
  SUBMISSION_ATTACHMENT_UPLOADED: 'assignment.submission.attachment.uploaded',
  SUBMISSION_ATTACHMENT_DELETED: 'assignment.submission.attachment.deleted',
  // Syllabus
  SYLLABUS_CREATED: 'syllabus.created',
  SYLLABUS_UPDATED: 'syllabus.updated',
  SYLLABUS_NODE_UPSERTED: 'syllabus.node.upserted',
  SYLLABUS_NODE_COMPLETED: 'syllabus.node.completed',
  SYLLABUS_DELETED: 'syllabus.deleted',
} as const;

export type AcademicContentOutboxTopic =
  (typeof AcademicContentOutboxTopics)[keyof typeof AcademicContentOutboxTopics];

// ---------------------------------------------------------------------------
// Notification event keys — 7 (registered with NotificationEventRegistry at
// boot via AcademicContentNotificationBootstrap).
// ---------------------------------------------------------------------------
export const AcademicContentNotificationEventKeys = {
  HOMEWORK_PUBLISHED: 'HOMEWORK_PUBLISHED',
  HOMEWORK_DUE_REMINDER: 'HOMEWORK_DUE_REMINDER',
  HOMEWORK_CLOSED: 'HOMEWORK_CLOSED',
  ASSIGNMENT_PUBLISHED: 'ASSIGNMENT_PUBLISHED',
  ASSIGNMENT_DUE_REMINDER: 'ASSIGNMENT_DUE_REMINDER',
  ASSIGNMENT_SUBMITTED: 'ASSIGNMENT_SUBMITTED',
  ASSIGNMENT_EVALUATED: 'ASSIGNMENT_EVALUATED',
} as const;

export type AcademicContentNotificationEventKey =
  (typeof AcademicContentNotificationEventKeys)[keyof typeof AcademicContentNotificationEventKeys];

// ---------------------------------------------------------------------------
// Enum value tuples — kept alongside DTOs for `@IsEnum` use.
// ---------------------------------------------------------------------------
export const CONTENT_STATUS_VALUES = [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
  'CANCELLED',
] as const;
export type ContentStatusValue = (typeof CONTENT_STATUS_VALUES)[number];

export const HOMEWORK_PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type HomeworkPriorityValue = (typeof HOMEWORK_PRIORITY_VALUES)[number];

export const ATTACHMENT_TYPE_VALUES = [
  'PDF',
  'DOC',
  'DOCX',
  'IMAGE',
  'WORKSHEET',
  'NOTE',
  'OTHER',
] as const;
export type AttachmentTypeValue = (typeof ATTACHMENT_TYPE_VALUES)[number];

export const SUBMISSION_STATUS_VALUES = [
  'SUBMITTED',
  'LATE_SUBMITTED',
  'EVALUATED',
  'REJECTED',
] as const;
export type SubmissionStatusValue = (typeof SUBMISSION_STATUS_VALUES)[number];

export const SYLLABUS_STATUS_VALUES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;
export type SyllabusStatusValue = (typeof SYLLABUS_STATUS_VALUES)[number];

export const SYLLABUS_NODE_TYPE_VALUES = ['UNIT', 'CHAPTER', 'TOPIC'] as const;
export type SyllabusNodeTypeValue = (typeof SYLLABUS_NODE_TYPE_VALUES)[number];

export const SYLLABUS_NODE_STATUS_VALUES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;
export type SyllabusNodeStatusValue =
  (typeof SYLLABUS_NODE_STATUS_VALUES)[number];

// ---------------------------------------------------------------------------
// File purposes — registered with Sprint 5 file-storage. Strings, not enum,
// to match how Sprint 5 / Sprint 11 consume the purpose discriminator.
// ---------------------------------------------------------------------------
export const FILE_PURPOSE_HOMEWORK_ATTACHMENT = 'HOMEWORK_ATTACHMENT' as const;
export const FILE_PURPOSE_ASSIGNMENT_ATTACHMENT = 'ASSIGNMENT_ATTACHMENT' as const;
export const FILE_PURPOSE_ASSIGNMENT_SUBMISSION = 'ASSIGNMENT_SUBMISSION' as const;

// ---------------------------------------------------------------------------
// Numeric / format guardrails.
// ---------------------------------------------------------------------------
/** Homework / Assignment code character set. */
export const ACADEMIC_CONTENT_CODE_PATTERN = /^[A-Z0-9_\-\.]{2,40}$/;

/** Hard ceiling on marks fields. */
export const MAX_MARKS_VALUE = 10_000;

/** Hard ceiling on a single syllabus node sequence value. */
export const MAX_NODE_SEQUENCE = 10_000;

/** Cap on free-text description / instructions (homework + assignment). */
export const DESCRIPTION_MAX_LENGTH = 10_000;

/** Cap on remarks fields (submission + evaluation). */
export const REMARKS_MAX_LENGTH = 1_000;

/** Cap on reason fields (cancellation + rejection). */
export const REASON_MAX_LENGTH = 500;
