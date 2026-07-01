/**
 * Shared lifecycle state machines for the academic-content module.
 *
 * Content lifecycle (Homework + Assignment):
 *   DRAFT      → PUBLISHED | CANCELLED
 *   PUBLISHED  → CLOSED    | CANCELLED
 *   CLOSED     → (terminal)
 *   CANCELLED  → (terminal)
 *
 * Submission lifecycle (AssignmentSubmission):
 *   SUBMITTED       → EVALUATED | REJECTED
 *   LATE_SUBMITTED  → EVALUATED | REJECTED
 *   EVALUATED       → (terminal)
 *   REJECTED        → (terminal)
 */
import {
  AssignmentInvalidStateTransitionError,
  AssignmentNotEditableError,
  AssignmentSubmissionNotEvaluableError,
  HomeworkInvalidStateTransitionError,
  HomeworkNotEditableError,
} from './academic-content.errors';
import type {
  ContentStatusValue,
  SubmissionStatusValue,
} from './academic-content.constants';

const CONTENT_TRANSITIONS: Readonly<
  Record<ContentStatusValue, readonly ContentStatusValue[]>
> = Object.freeze({
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
});

export const TERMINAL_CONTENT_STATUSES: ReadonlySet<ContentStatusValue> =
  new Set(['CLOSED', 'CANCELLED']);

function canTransition(
  from: ContentStatusValue,
  to: ContentStatusValue,
): boolean {
  return CONTENT_TRANSITIONS[from].includes(to);
}

export function assertHomeworkTransition(
  id: string,
  from: ContentStatusValue,
  to: ContentStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new HomeworkInvalidStateTransitionError(id, from, to);
  }
}

export function assertAssignmentTransition(
  id: string,
  from: ContentStatusValue,
  to: ContentStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new AssignmentInvalidStateTransitionError(id, from, to);
  }
}

/**
 * Fields editable on PATCH once Homework leaves DRAFT. PUBLISHED permits
 * schedule-shift fields only. CLOSED / CANCELLED refuses all edits.
 */
export const HOMEWORK_EDITABLE_FIELDS_POST_DRAFT: ReadonlySet<string> = new Set(
  ['dueDate', 'priority', 'instructions'],
);

export function assertHomeworkFieldEditable(
  id: string,
  status: ContentStatusValue,
  field: string,
): void {
  if (status === 'DRAFT') return;
  if (TERMINAL_CONTENT_STATUSES.has(status)) {
    throw new HomeworkNotEditableError(id, status, field);
  }
  if (!HOMEWORK_EDITABLE_FIELDS_POST_DRAFT.has(field)) {
    throw new HomeworkNotEditableError(id, status, field);
  }
}

/**
 * Fields editable on PATCH once Assignment leaves DRAFT.
 */
export const ASSIGNMENT_EDITABLE_FIELDS_POST_DRAFT: ReadonlySet<string> =
  new Set(['dueDate', 'description']);

export function assertAssignmentFieldEditable(
  id: string,
  status: ContentStatusValue,
  field: string,
): void {
  if (status === 'DRAFT') return;
  if (TERMINAL_CONTENT_STATUSES.has(status)) {
    throw new AssignmentNotEditableError(id, status, field);
  }
  if (!ASSIGNMENT_EDITABLE_FIELDS_POST_DRAFT.has(field)) {
    throw new AssignmentNotEditableError(id, status, field);
  }
}

// ---------------------------------------------------------------------------
// Submission state machine.
// ---------------------------------------------------------------------------
const SUBMISSION_TRANSITIONS: Readonly<
  Record<SubmissionStatusValue, readonly SubmissionStatusValue[]>
> = Object.freeze({
  SUBMITTED: ['EVALUATED', 'REJECTED'],
  LATE_SUBMITTED: ['EVALUATED', 'REJECTED'],
  EVALUATED: [],
  REJECTED: [],
});

export const TERMINAL_SUBMISSION_STATUSES: ReadonlySet<SubmissionStatusValue> =
  new Set(['EVALUATED', 'REJECTED']);

export function canSubmissionTransition(
  from: SubmissionStatusValue,
  to: SubmissionStatusValue,
): boolean {
  return SUBMISSION_TRANSITIONS[from].includes(to);
}

export function assertSubmissionTransition(
  id: string,
  from: SubmissionStatusValue,
  to: SubmissionStatusValue,
): void {
  if (!canSubmissionTransition(from, to)) {
    throw new AssignmentSubmissionNotEvaluableError(id, from);
  }
}
