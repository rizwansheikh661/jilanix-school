export { PrismaModule } from './prisma.module';
export { PrismaService } from './prisma.service';
export {
  PrismaInfraError,
  TenantContextMissingError,
  TenantScopeViolationError,
  VersionConflictError,
} from './errors';
export { MODEL_SCOPE, getModelScope, isAppendOnlyModel, isSoftDeleteModel } from './scope';
export type { ModelScope } from './scope';
export type { CursorPage, PrismaTx } from './types';
