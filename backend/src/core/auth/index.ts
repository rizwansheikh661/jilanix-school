export { AuthController } from './auth.controller';
export { CurrentTenant, CurrentUser, Public } from './auth.decorators';
export {
  AuthError,
  InvalidCredentialsError,
  MfaRequiredError,
  RefreshExpiredError,
  RefreshInvalidError,
  RefreshReusedError,
  SessionRevokedError,
  TenantNotFoundError,
  TokenExpiredError,
  TokenMalformedError,
  UserDisabledError,
} from './auth.errors';
export type { AuthFailureReason } from './auth.errors';
export { AuthModule } from './auth.module';
export { AuthService } from './auth.service';
export type {
  AuthPrincipal,
  AuthTokenPair,
  JwtClaims,
  LoginContext,
} from './auth.types';
export { JwtAuthGuard } from './jwt-auth.guard';
export { PasswordService } from './password/password.service';
export { AccessTokenService } from './token/access-token.service';
export { JwtKeysService } from './token/jwt-keys.service';
export { JwtStrategy } from './token/jwt.strategy';
export { RefreshTokenService } from './token/refresh-token.service';
export {
  AUTH_HEADER,
  AUTH_SCHEME,
  IS_PUBLIC_METADATA_KEY,
  JWT_ALGORITHM,
  REFRESH_TOKEN_LENGTH,
  REFRESH_TOKEN_PREFIX,
} from './token/token.constants';
