/**
 * AdmissionPermissions — granular keys for the Admission workflow.
 * Mirrors `StudentPermissions` layout. Document operations are split
 * into their own keys so a school can let an admissions clerk upload
 * paperwork without giving them workflow-decision rights.
 */
export const AdmissionPermissions = {
  READ: 'admission.read',
  CREATE: 'admission.create',
  UPDATE: 'admission.update',
  DELETE: 'admission.delete',
  SUBMIT: 'admission.submit',
  APPROVE: 'admission.approve',
  REJECT: 'admission.reject',
  WITHDRAW: 'admission.withdraw',
  DOCUMENT_READ: 'admission.document.read',
  DOCUMENT_CREATE: 'admission.document.create',
  DOCUMENT_DELETE: 'admission.document.delete',
} as const;

export type AdmissionPermission =
  (typeof AdmissionPermissions)[keyof typeof AdmissionPermissions];

export const ADMISSION_PERMISSION_DESCRIPTIONS: Readonly<
  Record<AdmissionPermission, string>
> = Object.freeze({
  [AdmissionPermissions.READ]: 'List and read admission records.',
  [AdmissionPermissions.CREATE]: 'Create admission records in DRAFT.',
  [AdmissionPermissions.UPDATE]: 'Update an admission while it is still DRAFT.',
  [AdmissionPermissions.DELETE]: 'Soft-delete admissions (DRAFT/REJECTED/WITHDRAWN only).',
  [AdmissionPermissions.SUBMIT]: 'Submit a draft admission for review.',
  [AdmissionPermissions.APPROVE]: 'Approve an admission — creates the Student + Parent rows.',
  [AdmissionPermissions.REJECT]: 'Reject a submitted admission.',
  [AdmissionPermissions.WITHDRAW]: 'Withdraw a DRAFT or SUBMITTED admission.',
  [AdmissionPermissions.DOCUMENT_READ]: 'List and read admission document metadata.',
  [AdmissionPermissions.DOCUMENT_CREATE]: 'Attach a document to an admission.',
  [AdmissionPermissions.DOCUMENT_DELETE]: 'Detach a document from an admission.',
});
