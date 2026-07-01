/**
 * Academic Foundation — public barrel.
 *
 * Re-exports the surface that other modules consume:
 *   - `AcademicModule` for composition root wiring (CoreModule).
 *   - `AcademicPermissions` + `ACADEMIC_PERMISSION_DESCRIPTIONS` for the
 *     guard / future admin UI.
 *   - Domain error types so callers can `instanceof`-check.
 *   - Internal `Row` types in case downstream modules need to consume them
 *     (e.g. a future Students module reading SectionRow).
 *
 * Repositories/services are NOT exported by default — feature modules
 * should not reach across module boundaries. Add an export here when a
 * specific cross-domain need arises (per BACKEND_ARCHITECTURE §3.2).
 */
export { AcademicModule } from './academic.module';
export {
  ACADEMIC_PERMISSION_DESCRIPTIONS,
  AcademicPermissions,
  type AcademicPermission,
} from './academic.constants';
export {
  AcademicError,
  AcademicYearNotActivatableError,
  AcademicYearOverlapError,
  ClassHasSectionsError,
  IfMatchMalformedError,
  IfMatchRequiredError,
  PromotionInvalidStateTransitionError,
  PromotionSameYearError,
  SectionSubjectReplacesNotInClassError,
  SectionSubjectReplacesRequiredError,
  SectionSubjectReplacesUnexpectedError,
  SectionTeacherNotEligibleError,
  SubjectCodeTakenError,
  TermDateRangeInvalidError,
  TermOutsideYearError,
  TermOverlapError,
  TermSequenceGapError,
  parseIfMatch,
  type AcademicErrorReason,
} from './academic.errors';
export {
  PROMOTION_STATUS_VALUES,
  SECTION_SUBJECT_MODES,
  SUBJECT_TYPE_VALUES,
  type AcademicTermRow,
  type AcademicYearPromotionRow,
  type AcademicYearRow,
  type ClassRow,
  type ClassSubjectRow,
  type PromotionStatusValue,
  type SectionRow,
  type SectionSubjectMode,
  type SectionSubjectRow,
  type SubjectRow,
  type SubjectTypeValue,
} from './academic.types';
