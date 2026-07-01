/**
 * Academic-content domain errors. All extend the shared `DomainError`
 * hierarchy so the global filter maps them to the canonical envelope via
 * `ERROR_CODES`.
 *
 * Note: `VersionConflictError`, `NotFoundError`, and `ConflictError` are
 * reused from `core/errors` / `infra/prisma/errors` where appropriate.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  ContentStatusValue,
  SubmissionStatusValue,
  SyllabusNodeTypeValue,
} from './academic-content.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class HomeworkNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Homework', id);
  }
}

export class HomeworkAttachmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('HomeworkAttachment', id);
  }
}

export class AssignmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Assignment', id);
  }
}

export class AssignmentAttachmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AssignmentAttachment', id);
  }
}

export class AssignmentSubmissionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AssignmentSubmission', id);
  }
}

export class AssignmentSubmissionAttachmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('AssignmentSubmissionAttachment', id);
  }
}

export class SyllabusNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Syllabus', id);
  }
}

export class SyllabusNodeNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('SyllabusNode', id);
  }
}

// ---------------------------------------------------------------------------
// Conflict (duplicate code / submission / syllabus — STORED deleted_at_key
// partial uniques)
// ---------------------------------------------------------------------------
export class DuplicateHomeworkCodeError extends ConflictError {
  constructor(code: string) {
    super('A homework with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'Homework', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateAssignmentCodeError extends ConflictError {
  constructor(code: string) {
    super('An assignment with this code already exists for the school.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'Assignment', conflictField: 'code', value: code },
    });
  }
}

export class DuplicateAssignmentSubmissionError extends ConflictError {
  constructor(assignmentId: string, studentId: string) {
    super('Student already has an active submission for this assignment.', {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: {
        resource: 'AssignmentSubmission',
        assignmentId,
        studentId,
      },
    });
  }
}

export class DuplicateSyllabusError extends ConflictError {
  constructor(academicYearId: string, classId: string, subjectId: string) {
    super(
      'An active syllabus already exists for this academic year, class, and subject.',
      {
        code: ERROR_CODES.DUPLICATE_RESOURCE,
        details: {
          resource: 'Syllabus',
          academicYearId,
          classId,
          subjectId,
        },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class AcademicContentModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Academic-content module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.academic-content' },
    });
  }
}

// ---------------------------------------------------------------------------
// State / lifecycle (shared by Homework + Assignment)
// ---------------------------------------------------------------------------
export class HomeworkInvalidStateTransitionError extends DomainError {
  constructor(id: string, from: ContentStatusValue, to: ContentStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Homework cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class HomeworkNotEditableError extends DomainError {
  constructor(id: string, status: ContentStatusValue, field: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Field "${field}" is not editable once the homework status is ${status}.`,
      details: { reason: 'NOT_EDITABLE', id, status, field },
    });
  }
}

export class AssignmentInvalidStateTransitionError extends DomainError {
  constructor(id: string, from: ContentStatusValue, to: ContentStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Assignment cannot transition from ${from} to ${to}.`,
      details: { reason: 'INVALID_STATE_TRANSITION', id, from, to },
    });
  }
}

export class AssignmentNotEditableError extends DomainError {
  constructor(id: string, status: ContentStatusValue, field: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Field "${field}" is not editable once the assignment status is ${status}.`,
      details: { reason: 'NOT_EDITABLE', id, status, field },
    });
  }
}

export class ContentDateRangeInvalidError extends DomainError {
  constructor(
    resource: 'Homework' | 'Assignment',
    assignedDate: string,
    dueDate: string,
  ) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `${resource} dueDate (${dueDate}) must be on or after assignedDate (${assignedDate}).`,
      details: { reason: 'INVALID_DATE_RANGE', assignedDate, dueDate },
    });
  }
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------
export class AssignmentMarksInvalidError extends DomainError {
  constructor(maxMarks: number, passingMarks: number) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `passingMarks (${passingMarks}) must be <= maxMarks (${maxMarks}).`,
      details: { reason: 'INVALID_MARKS', maxMarks, passingMarks },
    });
  }
}

export class AssignmentSubmissionMarksOutOfRangeError extends DomainError {
  constructor(marksObtained: number, maxMarks: number) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `marksObtained (${marksObtained}) must be between 0 and maxMarks (${maxMarks}).`,
      details: { reason: 'MARKS_OUT_OF_RANGE', marksObtained, maxMarks },
    });
  }
}

// ---------------------------------------------------------------------------
// Submission lifecycle
// ---------------------------------------------------------------------------
export class AssignmentSubmissionNotEvaluableError extends DomainError {
  constructor(id: string, status: SubmissionStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Submission is not in a state that can be evaluated/rejected (current=${status}).`,
      details: { reason: 'NOT_EVALUABLE', id, status },
    });
  }
}

export class AssignmentNotAcceptingSubmissionsError extends DomainError {
  constructor(id: string, status: ContentStatusValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Assignment is not accepting submissions in its current status (${status}). Must be PUBLISHED or CLOSED.`,
      details: { reason: 'NOT_ACCEPTING_SUBMISSIONS', id, status },
    });
  }
}

// ---------------------------------------------------------------------------
// Syllabus hierarchy
// ---------------------------------------------------------------------------
export class SyllabusNodeHierarchyInvalidError extends DomainError {
  constructor(
    nodeType: SyllabusNodeTypeValue,
    parentNodeType: SyllabusNodeTypeValue | null,
  ) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Invalid syllabus hierarchy: ${nodeType} cannot have parent of type ${parentNodeType ?? 'null'}.`,
      details: { reason: 'INVALID_HIERARCHY', nodeType, parentNodeType },
    });
  }
}

export class SyllabusNodeNotCompletableError extends DomainError {
  constructor(id: string, nodeType: SyllabusNodeTypeValue) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Only leaf nodes (TOPIC) can be directly completed. Node ${id} is a ${nodeType}.`,
      details: { reason: 'NOT_COMPLETABLE', id, nodeType },
    });
  }
}

// ---------------------------------------------------------------------------
// Cross-tenant FK guard
// ---------------------------------------------------------------------------
export class TenantRefMissingError extends DomainError {
  constructor(refType: string, id: string) {
    super({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: `Referenced ${refType} (${id}) does not exist in this tenant.`,
      details: { reason: 'TENANT_REF_MISSING', refType, id },
    });
  }
}
