/**
 * Academic-content module shared types — row shapes returned by repositories
 * and consumed by services / DTOs.
 */
import type {
  AttachmentTypeValue,
  ContentStatusValue,
  HomeworkPriorityValue,
  SubmissionStatusValue,
  SyllabusNodeStatusValue,
  SyllabusNodeTypeValue,
  SyllabusStatusValue,
} from './academic-content.constants';

export interface HomeworkRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly assignedByStaffId: string;
  readonly assignedDate: Date;
  readonly dueDate: Date;
  readonly priority: HomeworkPriorityValue;
  readonly status: ContentStatusValue;
  readonly publishedAt: Date | null;
  readonly closedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly attachmentCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface HomeworkAttachmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly homeworkId: string;
  readonly fileAssetId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface AssignmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly subjectId: string;
  readonly assignedByStaffId: string;
  readonly assignedDate: Date;
  readonly dueDate: Date;
  readonly maxMarks: number;
  readonly passingMarks: number;
  readonly status: ContentStatusValue;
  readonly publishedAt: Date | null;
  readonly closedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
  readonly submissionCount: number;
  readonly evaluatedCount: number;
  readonly lateCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface AssignmentAttachmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly assignmentId: string;
  readonly fileAssetId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface AssignmentSubmissionRow {
  readonly id: string;
  readonly schoolId: string;
  readonly assignmentId: string;
  readonly studentId: string;
  readonly submittedAt: Date;
  readonly isLate: boolean;
  readonly status: SubmissionStatusValue;
  readonly recordedByStaffId: string | null;
  readonly remarks: string | null;
  readonly marksObtained: number | null;
  readonly evaluatedAt: Date | null;
  readonly evaluatedByStaffId: string | null;
  readonly evaluationRemarks: string | null;
  readonly rubricSnapshot: unknown | null;
  readonly rejectedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface AssignmentSubmissionAttachmentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly submissionId: string;
  readonly fileAssetId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface SyllabusRow {
  readonly id: string;
  readonly schoolId: string;
  readonly academicYearId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly status: SyllabusStatusValue;
  readonly plannedCompletionDate: Date | null;
  readonly actualCompletionDate: Date | null;
  readonly completionPercent: number;
  readonly ownedByStaffId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}

export interface SyllabusNodeRow {
  readonly id: string;
  readonly schoolId: string;
  readonly syllabusId: string;
  readonly parentNodeId: string | null;
  readonly nodeType: SyllabusNodeTypeValue;
  readonly name: string;
  readonly sequence: number;
  readonly plannedCompletionDate: Date | null;
  readonly actualCompletionDate: Date | null;
  readonly status: SyllabusNodeStatusValue;
  readonly completedByStaffId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly version: number;
}
