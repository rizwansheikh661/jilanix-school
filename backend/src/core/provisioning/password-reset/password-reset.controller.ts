/**
 * PasswordResetController — three routes:
 *
 *   POST /v1/auth/password-reset/request    (Public, anonymous)
 *   POST /v1/auth/password-reset/confirm    (Public, anonymous)
 *   POST /v1/auth/first-login/change-password (Authenticated)
 *
 * Anonymous endpoints intentionally accept-then-no-op when the email
 * isn't found, so attackers cannot enumerate accounts. They never echo
 * the reset token back over HTTP — the token is consumed by the email
 * worker via the outbox payload published from the service layer.
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { CurrentUser, Public } from '../../auth/auth.decorators';
import type { AuthPrincipal } from '../../auth/auth.types';
import type { RequestWithResolvedTenant } from '../../request-context';
import { AllowWhenInactive } from '../../subscription';
import {
  PASSWORD_MIN_LENGTH,
  PasswordResetService,
} from './password-reset.service';

export class RequestPasswordResetDto {
  /**
   * @deprecated Tenant is resolved from the `X-Tenant-Slug` header (or host
   * in production) when omitted. Kept optional for one migration cycle so
   * legacy callers still validate.
   */
  @ApiProperty({ description: 'Tenant identifier (legacy — host header preferred).', required: false })
  @IsOptional()
  @IsUUID()
  public readonly schoolId?: string;

  @ApiProperty({ maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  public readonly email!: string;
}

export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'Reset token delivered to the user via email.',
    minLength: 32,
    maxLength: 200,
  })
  @IsString()
  @Length(32, 200)
  public readonly token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: 128 })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128)
  public readonly newPassword!: string;
}

export class FirstLoginChangePasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  public readonly currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: 128 })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, 128)
  public readonly newPassword!: string;
}

export class PasswordResetAcceptedDto {
  @ApiProperty({ default: true })
  public readonly accepted!: true;
}

@ApiTags('Auth · Password Reset')
@AllowWhenInactive()
@Controller({ path: 'auth', version: '1' })
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request a password reset email. Always returns `{ accepted: true }` ' +
      'regardless of whether the email matches a user (anti-enumeration).',
  })
  @ApiOkResponse({ type: PasswordResetAcceptedDto })
  public async requestReset(
    @Body() body: RequestPasswordResetDto,
    @Req() req: Request,
  ): Promise<PasswordResetAcceptedDto> {
    const resolved = (req as unknown as RequestWithResolvedTenant).resolvedTenant;
    const schoolId = body.schoolId ?? resolved?.schoolId;
    if (schoolId === undefined) {
      // Anti-enumeration: silently accept rather than leak that tenant
      // context is missing. The async pipeline below is a no-op without
      // a tenant. Mirrors the "user not found" no-leak semantics.
      return { accepted: true };
    }
    await this.service.request({
      schoolId,
      email: body.email,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
      ...(extractUserAgent(req) !== undefined ? { userAgent: extractUserAgent(req) as string } : {}),
    });
    return { accepted: true };
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Consume a reset token and set a new password. Revokes every active ' +
      'session for the user.',
  })
  @ApiNoContentResponse()
  public async confirmReset(
    @Body() body: ConfirmPasswordResetDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.service.confirm({
      token: body.token,
      newPassword: body.newPassword,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
      ...(extractUserAgent(req) !== undefined ? { userAgent: extractUserAgent(req) as string } : {}),
    });
  }

  @ApiBearerAuth()
  @Post('first-login/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Authenticated path used on first login when `must_change_password` ' +
      'is set. Clears the flag and revokes sibling sessions.',
  })
  @ApiNoContentResponse()
  public async firstLoginChange(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: FirstLoginChangePasswordDto,
  ): Promise<void> {
    if (principal.schoolId === null) {
      throw new Error('first-login change is only valid for tenant-scoped principals.');
    }
    await this.service.firstLoginChange({
      schoolId: principal.schoolId,
      userId: principal.userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }
}

function extractUserAgent(req: Request): string | undefined {
  const v = req.headers['user-agent'];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
