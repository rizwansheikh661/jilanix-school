/**
 * StaffPermissions — granular keys for the Staff domain.
 *
 * 24 keys total spanning master Staff + 7 sub-resources. The `staff.pii.read`
 * key gates access to the decrypted Aadhaar / PAN / bank account values
 * returned by the `/staff/:id/pii` endpoint; standard `staff.read` returns
 * the `*_last4` projection only.
 */
export const StaffPermissions = {
  // Master Staff
  READ: 'staff.read',
  PII_READ: 'staff.pii.read',
  CREATE: 'staff.create',
  UPDATE: 'staff.update',
  DEACTIVATE: 'staff.deactivate',
  REACTIVATE: 'staff.reactivate',
  DELETE: 'staff.delete',

  // Qualifications (degrees / certifications / experience)
  QUALIFICATION_READ: 'staff.qualification.read',
  QUALIFICATION_CREATE: 'staff.qualification.create',
  QUALIFICATION_DELETE: 'staff.qualification.delete',

  // Subject qualifications (M:N staff ↔ subject)
  SUBJECT_QUALIFICATION_READ: 'staff.subject_qualification.read',
  SUBJECT_QUALIFICATION_SET: 'staff.subject_qualification.set',

  // Section / subject teaching assignments
  SECTION_ASSIGNMENT_READ: 'staff.section_assignment.read',
  SECTION_ASSIGNMENT_CREATE: 'staff.section_assignment.create',
  SECTION_ASSIGNMENT_DELETE: 'staff.section_assignment.delete',

  // Employment-history event log
  EMPLOYMENT_HISTORY_READ: 'staff.employment_history.read',

  // Documents (metadata only this sprint)
  DOCUMENT_READ: 'staff.document.read',
  DOCUMENT_CREATE: 'staff.document.create',
  DOCUMENT_DELETE: 'staff.document.delete',

  // Leaves
  LEAVE_READ: 'staff.leave.read',
  LEAVE_CREATE: 'staff.leave.create',
  LEAVE_UPDATE: 'staff.leave.update',
  LEAVE_SUBMIT: 'staff.leave.submit',
  LEAVE_APPROVE: 'staff.leave.approve',
  LEAVE_REJECT: 'staff.leave.reject',
  LEAVE_CANCEL: 'staff.leave.cancel',

  // Class teacher (homeroom assignment)
  CLASS_TEACHER_READ: 'class_teacher.read',
  CLASS_TEACHER_ASSIGN: 'class_teacher.assign',
  CLASS_TEACHER_REVOKE: 'class_teacher.revoke',
} as const;

export type StaffPermission = (typeof StaffPermissions)[keyof typeof StaffPermissions];

export const STAFF_PERMISSION_DESCRIPTIONS: Readonly<Record<StaffPermission, string>> =
  Object.freeze({
    [StaffPermissions.READ]: 'List and read staff master records (PII masked).',
    [StaffPermissions.PII_READ]: 'Reveal staff PII (Aadhaar / PAN / bank account) — audited.',
    [StaffPermissions.CREATE]: 'Create staff records and allocate employee codes.',
    [StaffPermissions.UPDATE]: 'Update staff master fields.',
    [StaffPermissions.DEACTIVATE]: 'Mark a staff record INACTIVE.',
    [StaffPermissions.REACTIVATE]: 'Mark a staff record ACTIVE.',
    [StaffPermissions.DELETE]: 'Soft-delete a staff record.',
    [StaffPermissions.QUALIFICATION_READ]: 'List staff qualifications.',
    [StaffPermissions.QUALIFICATION_CREATE]: 'Add a staff qualification.',
    [StaffPermissions.QUALIFICATION_DELETE]: 'Remove a staff qualification.',
    [StaffPermissions.SUBJECT_QUALIFICATION_READ]:
      'List subjects a staff member is qualified to teach.',
    [StaffPermissions.SUBJECT_QUALIFICATION_SET]:
      'Replace the set of subjects a staff member is qualified to teach.',
    [StaffPermissions.SECTION_ASSIGNMENT_READ]:
      'List teaching assignments (teacher ↔ section ↔ subject ↔ year).',
    [StaffPermissions.SECTION_ASSIGNMENT_CREATE]: 'Assign a teacher to a section / subject.',
    [StaffPermissions.SECTION_ASSIGNMENT_DELETE]: 'Remove a teaching assignment.',
    [StaffPermissions.EMPLOYMENT_HISTORY_READ]: 'Read the employment-history event log.',
    [StaffPermissions.DOCUMENT_READ]: 'List staff document metadata.',
    [StaffPermissions.DOCUMENT_CREATE]: 'Attach a document to a staff record.',
    [StaffPermissions.DOCUMENT_DELETE]: 'Detach a document from a staff record.',
    [StaffPermissions.LEAVE_READ]: 'List and read staff leave records.',
    [StaffPermissions.LEAVE_CREATE]: 'Create a staff leave request (DRAFT).',
    [StaffPermissions.LEAVE_UPDATE]: 'Update a DRAFT staff leave request.',
    [StaffPermissions.LEAVE_SUBMIT]: 'Submit a DRAFT staff leave request for review.',
    [StaffPermissions.LEAVE_APPROVE]: 'Approve a submitted staff leave request.',
    [StaffPermissions.LEAVE_REJECT]: 'Reject a submitted staff leave request.',
    [StaffPermissions.LEAVE_CANCEL]: 'Cancel a staff leave request.',
    [StaffPermissions.CLASS_TEACHER_READ]: 'List class-teacher (homeroom) assignments.',
    [StaffPermissions.CLASS_TEACHER_ASSIGN]: 'Assign a class teacher to a section / year.',
    [StaffPermissions.CLASS_TEACHER_REVOKE]: 'Revoke a class-teacher assignment.',
  });
