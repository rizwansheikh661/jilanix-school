/**
 * AuthController — login / refresh / logout / logout-all / me.
 *
 * Routing:
 *   POST /v1/auth/login        — public; identifies a user, mints tokens.
 *   POST /v1/auth/refresh      — public; rotates a refresh token.
 *   POST /v1/auth/logout       — authenticated; revokes the caller's chain.
 *   POST /v1/auth/logout-all   — authenticated; revokes every active session.
 *   GET  /v1/auth/me           — authenticated; introspects the principal.
 *
 * The login + refresh endpoints are `@Public()` because the global
 * JwtAuthGuard would otherwise reject the request before we have a
 * chance to verify credentials.
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Public, CurrentUser } from './auth.decorators';
import { AuthService } from './auth.service';
import {
  AuthMeDto,
  AuthTokensDto,
  LoginDto,
  RefreshDto,
} from './auth.dto';
import type { AuthPrincipal, LoginContext } from './auth.types';
import { AllowWhenInactive } from '../subscription';
import type { RequestWithResolvedTenant } from '../request-context';

@ApiTags('Auth')
@AllowWhenInactive()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email + password; returns access + refresh tokens.' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'invalid_credentials | user_disabled | mfa_required' })
  public async login(@Body() body: LoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    const tokens = await this.auth.login({
      schoolId: body.schoolId,
      tenantSlug: body.tenantSlug,
      email: body.email,
      identifier: body.identifier,
      identifierType: body.identifierType,
      password: body.password,
      rememberMe: body.rememberMe,
      resolvedTenant: (req as RequestWithResolvedTenant).resolvedTenant,
      context: extractLoginContext(req, body.deviceId),
    });
    return tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token; returns a new access + refresh pair.' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'refresh_invalid | refresh_expired | refresh_reused' })
  public async refresh(@Body() body: RefreshDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.refresh({
      refreshToken: body.refreshToken,
      context: extractLoginContext(req),
    });
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh-token chain (this device)." })
  public async logout(
    @CurrentUser() principal: AuthPrincipal,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.logout(principal, extractLoginContext(req));
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every active session for the current user.' })
  @ApiOkResponse({ schema: { type: 'object', properties: { revokedSessions: { type: 'integer' } } } })
  public async logoutAll(
    @CurrentUser() principal: AuthPrincipal,
    @Req() req: Request,
  ): Promise<{ revokedSessions: number }> {
    const count = await this.auth.logoutAll(principal, extractLoginContext(req));
    return { revokedSessions: count };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Introspect the authenticated principal.' })
  @ApiOkResponse({ type: AuthMeDto })
  public me(@CurrentUser() principal: AuthPrincipal): Promise<AuthMeDto> {
    return this.auth.describeMe(principal);
  }
}

function extractLoginContext(req: Request, deviceId?: string): LoginContext {
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? undefined,
    userAgent: pickHeader(req, 'user-agent'),
    deviceId,
  };
}

function pickHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}
