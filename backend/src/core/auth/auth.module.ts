/**
 * AuthModule — wires identity into the API.
 *
 * Registers:
 *   - JwtModule (no global secret; AccessTokenService passes the key per call)
 *   - PassportModule with the `jwt` default strategy
 *   - JwtKeysService — loads + validates the RS256 keypair at boot
 *   - PasswordService, AccessTokenService, RefreshTokenService — primitives
 *   - User / Session / LoginEvent repositories
 *   - AuthService — login / refresh / logout. Reads UserRoleRepository
 *                   (provided by RbacModule) to populate the JWT `role_ids`
 *                   claim at login + refresh.
 *   - AuthController — HTTP endpoints
 *   - JwtStrategy — passport-jwt strategy
 *
 * Exports `JwtAuthGuard` (registered globally via APP_GUARD in CoreModule)
 * and `AuthService` for any future module that needs to mint or revoke
 * sessions internally (e.g. password reset).
 *
 * @Global so `@CurrentUser()` works without each feature module having to
 * import AuthModule explicitly.
 */
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule } from '../config';
import { FeatureFlagModule } from '../feature-flag';
import { RbacModule } from '../rbac';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password/password.service';
import { LoginEventRepository } from './repositories/login-event.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { AccessTokenService } from './token/access-token.service';
import { JwtKeysService } from './token/jwt-keys.service';
import { JwtStrategy } from './token/jwt.strategy';
import { RefreshTokenService } from './token/refresh-token.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    RbacModule,
    FeatureFlagModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // We don't pass a key here — AccessTokenService injects keys per
    // call so we keep the keypair in one well-defined place.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    JwtKeysService,
    PasswordService,
    AccessTokenService,
    RefreshTokenService,
    UserRepository,
    SessionRepository,
    LoginEventRepository,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtKeysService,
    AccessTokenService,
    PasswordService,
    UserRepository,
    SessionRepository,
  ],
})
export class AuthModule {}
