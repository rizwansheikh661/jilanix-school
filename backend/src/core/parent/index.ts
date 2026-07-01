/**
 * Parent domain — public barrel. Mirrors the Student barrel pattern:
 * module + service for cross-module wiring, permission catalog, typed
 * errors, and the public Row types.
 */
export { ParentModule } from './parent.module';
export { ParentService } from './parent/parent.service';
export type {
  CreateParentArgs,
  LinkStudentArgs,
  ListParentsArgs,
  UpdateParentArgs,
} from './parent/parent.service';
export {
  PARENT_PERMISSION_DESCRIPTIONS,
  ParentPermissions,
  type ParentPermission,
} from './parent.constants';
export {
  ParentContactRequiredError,
  ParentError,
  ParentHasActiveLinksError,
  ParentLinkAlreadyExistsError,
  ParentLinkLimitExceededError,
  PrimaryContactConflictError,
  type ParentErrorReason,
} from './parent.errors';
export {
  PARENT_LINKS_PER_STUDENT_LIMIT,
  PARENT_RELATION_VALUES,
  type ParentRelationValue,
  type ParentRow,
  type ParentStudentLinkRow,
} from './parent.types';
