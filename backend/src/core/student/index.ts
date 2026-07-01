/**
 * Student domain — public barrel.
 *
 * Exposes the module, the permission catalog, the typed errors (so
 * callers can `instanceof`-check), and the public `Row` types. The
 * service is exported via `StudentModule` (not as a value here) — the
 * Nest DI container is the only sanctioned way to obtain it.
 */
export { StudentModule } from './student.module';
export { StudentService } from './student/student.service';
export type {
  CreateStudentArgs,
  ListStudentsArgs,
  UpdateStudentArgs,
} from './student/student.service';
export {
  STUDENT_PERMISSION_DESCRIPTIONS,
  StudentPermissions,
  type StudentPermission,
} from './student.constants';
export {
  AdmissionNumberTakenError,
  PlacementInvalidError,
  RollNumberTakenError,
  StudentError,
  StudentInactiveError,
  type StudentErrorReason,
} from './student.errors';
export {
  ADMISSION_TYPE_VALUES,
  GENDER_VALUES,
  RELIGION_VALUES,
  SOCIAL_CATEGORY_VALUES,
  STUDENT_STATUS_VALUES,
  type AdmissionTypeValue,
  type EmergencyContact,
  type GenderValue,
  type ReligionValue,
  type SocialCategoryValue,
  type StudentRow,
  type StudentStatusValue,
} from './student.types';
