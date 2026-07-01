/**
 * Admission domain — public barrel. Mirrors the Student and Parent
 * barrels: module + service for cross-module wiring, permission
 * catalog, typed errors, and the public Row types.
 */
export { AdmissionModule } from './admission.module';
export { AdmissionService } from './admission/admission.service';
export type {
  ApproveAdmissionArgs,
  CreateAdmissionArgs,
  DecisionArgs,
  ListAdmissionsArgs,
  UpdateAdmissionArgs,
} from './admission/admission.service';
export { AdmissionDocumentService } from './document/admission-document.service';
export type { CreateAdmissionDocumentArgs } from './document/admission-document.service';
export {
  ADMISSION_PERMISSION_DESCRIPTIONS,
  AdmissionPermissions,
  type AdmissionPermission,
} from './admission.constants';
export {
  AdmissionAlreadyDecidedError,
  AdmissionDocumentNotFoundError,
  AdmissionError,
  AdmissionNotApprovableError,
  AdmissionNotDeletableError,
  InvalidAdmissionTransitionError,
  type AdmissionErrorReason,
} from './admission.errors';
export {
  ADMISSION_STATUS_VALUES,
  ADMISSION_TERMINAL_STATES,
  type AdmissionDocumentRow,
  type AdmissionHistoryRow,
  type AdmissionRow,
  type AdmissionStatusValue,
} from './admission.types';
