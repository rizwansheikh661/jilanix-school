/**
 * Pure-function state-machine specs — Homework + Assignment lifecycle
 * transitions, post-DRAFT field whitelists, and submission lifecycle.
 */
import {
  AssignmentInvalidStateTransitionError,
  AssignmentNotEditableError,
  AssignmentSubmissionNotEvaluableError,
  HomeworkInvalidStateTransitionError,
  HomeworkNotEditableError,
} from './academic-content.errors';
import {
  ASSIGNMENT_EDITABLE_FIELDS_POST_DRAFT,
  HOMEWORK_EDITABLE_FIELDS_POST_DRAFT,
  TERMINAL_CONTENT_STATUSES,
  TERMINAL_SUBMISSION_STATUSES,
  assertAssignmentFieldEditable,
  assertAssignmentTransition,
  assertHomeworkFieldEditable,
  assertHomeworkTransition,
  assertSubmissionTransition,
  canSubmissionTransition,
} from './state-machine';

describe('academic-content state-machine', () => {
  const ID = 'hw-1';

  describe('content transitions (Homework + Assignment)', () => {
    const allowed: ReadonlyArray<[string, string]> = [
      ['DRAFT', 'PUBLISHED'],
      ['DRAFT', 'CANCELLED'],
      ['PUBLISHED', 'CLOSED'],
      ['PUBLISHED', 'CANCELLED'],
    ];

    it.each(allowed)('permits %s → %s for Homework', (from, to) => {
      expect(() =>
        assertHomeworkTransition(ID, from as never, to as never),
      ).not.toThrow();
    });

    it.each(allowed)('permits %s → %s for Assignment', (from, to) => {
      expect(() =>
        assertAssignmentTransition(ID, from as never, to as never),
      ).not.toThrow();
    });

    it('refuses CLOSED → anything (Homework)', () => {
      expect(() =>
        assertHomeworkTransition(ID, 'CLOSED', 'CANCELLED'),
      ).toThrow(HomeworkInvalidStateTransitionError);
    });

    it('refuses CANCELLED → PUBLISHED (Assignment)', () => {
      expect(() =>
        assertAssignmentTransition(ID, 'CANCELLED', 'PUBLISHED'),
      ).toThrow(AssignmentInvalidStateTransitionError);
    });

    it('marks CLOSED + CANCELLED as terminal', () => {
      expect(TERMINAL_CONTENT_STATUSES.has('CLOSED')).toBe(true);
      expect(TERMINAL_CONTENT_STATUSES.has('CANCELLED')).toBe(true);
      expect(TERMINAL_CONTENT_STATUSES.size).toBe(2);
    });
  });

  describe('homework field editability', () => {
    it('permits any field in DRAFT', () => {
      for (const field of ['title', 'priority', 'instructions', 'subjectId']) {
        expect(() => assertHomeworkFieldEditable(ID, 'DRAFT', field)).not.toThrow();
      }
    });

    it('permits only whitelisted fields in PUBLISHED', () => {
      for (const field of HOMEWORK_EDITABLE_FIELDS_POST_DRAFT) {
        expect(() =>
          assertHomeworkFieldEditable(ID, 'PUBLISHED', field),
        ).not.toThrow();
      }
      expect(() => assertHomeworkFieldEditable(ID, 'PUBLISHED', 'title')).toThrow(
        HomeworkNotEditableError,
      );
    });

    it('rejects all fields in CLOSED / CANCELLED', () => {
      for (const status of ['CLOSED', 'CANCELLED'] as const) {
        expect(() => assertHomeworkFieldEditable(ID, status, 'dueDate')).toThrow(
          HomeworkNotEditableError,
        );
      }
    });
  });

  describe('assignment field editability', () => {
    it('permits any field in DRAFT', () => {
      for (const field of ['title', 'description', 'maxMarks']) {
        expect(() =>
          assertAssignmentFieldEditable(ID, 'DRAFT', field),
        ).not.toThrow();
      }
    });

    it('permits only whitelisted fields in PUBLISHED', () => {
      for (const field of ASSIGNMENT_EDITABLE_FIELDS_POST_DRAFT) {
        expect(() =>
          assertAssignmentFieldEditable(ID, 'PUBLISHED', field),
        ).not.toThrow();
      }
      expect(() =>
        assertAssignmentFieldEditable(ID, 'PUBLISHED', 'maxMarks'),
      ).toThrow(AssignmentNotEditableError);
    });

    it('rejects all fields in CLOSED / CANCELLED', () => {
      expect(() =>
        assertAssignmentFieldEditable(ID, 'CLOSED', 'dueDate'),
      ).toThrow(AssignmentNotEditableError);
    });
  });

  describe('submission transitions', () => {
    it('permits SUBMITTED / LATE_SUBMITTED → EVALUATED', () => {
      expect(canSubmissionTransition('SUBMITTED', 'EVALUATED')).toBe(true);
      expect(canSubmissionTransition('LATE_SUBMITTED', 'EVALUATED')).toBe(true);
    });

    it('permits SUBMITTED / LATE_SUBMITTED → REJECTED', () => {
      expect(canSubmissionTransition('SUBMITTED', 'REJECTED')).toBe(true);
      expect(canSubmissionTransition('LATE_SUBMITTED', 'REJECTED')).toBe(true);
    });

    it('refuses EVALUATED → REJECTED (terminal)', () => {
      expect(canSubmissionTransition('EVALUATED', 'REJECTED')).toBe(false);
      expect(() =>
        assertSubmissionTransition('sub-1', 'EVALUATED', 'REJECTED'),
      ).toThrow(AssignmentSubmissionNotEvaluableError);
    });

    it('marks EVALUATED + REJECTED as terminal', () => {
      expect(TERMINAL_SUBMISSION_STATUSES.has('EVALUATED')).toBe(true);
      expect(TERMINAL_SUBMISSION_STATUSES.has('REJECTED')).toBe(true);
      expect(TERMINAL_SUBMISSION_STATUSES.size).toBe(2);
    });
  });
});
