/**
 * ParentPreferenceController — Sprint 17 W5.
 *
 * Exposes the parent-portal `/api/v1/parents/me/preferences` surface.
 * Delegates to `ParentPreferenceService` which gates on the
 * `parent_portal` feature flag and the caller's `ParentUser` row.
 *
 * Schema/payload mirrors the existing
 * `/api/v1/notifications/preferences/me` controller plus the two
 * Sprint 17 columns (`channelPush`, `emergencyOverride`).
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { QUIET_HOURS_PATTERN } from '../../notifications/notifications.constants';
import type { NotificationUserPreferenceRow } from '../../notifications/notifications.types';
import { RequirePermissions } from '../../rbac';
import { ParentPermissions } from '../parent.constants';
import { ParentPreferenceService } from './parent-preference.service';

export class ParentMePreferenceUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly channelEmail?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly channelSms?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly channelWhatsapp?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly channelInApp?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public readonly channelPush?: boolean;

  @ApiPropertyOptional({
    description:
      'When true (default), CRITICAL-priority messages bypass channel + category opt-outs and quiet hours.',
  })
  @IsOptional()
  @IsBoolean()
  public readonly emergencyOverride?: boolean;

  @ApiPropertyOptional({
    description:
      'Shape: { [NotificationCategory]: NotificationChannel[] }. ' +
      'Channels listed are opted-out for that category.',
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  public readonly categoryOptOuts?: Record<string, readonly string[]> | null;

  @ApiPropertyOptional({ pattern: QUIET_HOURS_PATTERN.source, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(QUIET_HOURS_PATTERN)
  public readonly quietHoursStart?: string | null;

  @ApiPropertyOptional({ pattern: QUIET_HOURS_PATTERN.source, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(QUIET_HOURS_PATTERN)
  public readonly quietHoursEnd?: string | null;

  @ApiPropertyOptional({ maxLength: 40, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  public readonly quietHoursTimezone?: string | null;

  @ApiPropertyOptional({ minLength: 2, maxLength: 5 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  public readonly locale?: string;
}

export class ParentMePreferenceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly userId!: string;
  @ApiProperty() public readonly channelEmail!: boolean;
  @ApiProperty() public readonly channelSms!: boolean;
  @ApiProperty() public readonly channelWhatsapp!: boolean;
  @ApiProperty() public readonly channelInApp!: boolean;
  @ApiProperty() public readonly channelPush!: boolean;
  @ApiProperty() public readonly emergencyOverride!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly categoryOptOuts!: Record<string, readonly string[]> | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursStart!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursEnd!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursTimezone!: string | null;
  @ApiProperty() public readonly locale!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
}

@ApiTags('Parent Portal — Me')
@ApiBearerAuth()
@Controller({ path: 'parents', version: '1' })
export class ParentPreferenceController {
  constructor(private readonly service: ParentPreferenceService) {}

  @Get('me/preferences')
  @RequirePermissions(ParentPermissions.READ_SELF)
  @ApiOperation({
    summary:
      'Get the calling parent\u2019s notification preferences. Lazy-creates defaults on first read.',
  })
  @ApiOkResponse({ type: ParentMePreferenceResponseDto })
  @ApiForbiddenResponse({ description: 'Not a parent user or parent_portal disabled.' })
  public async getMine(): Promise<ParentMePreferenceResponseDto> {
    const row = await this.service.getMine();
    return toResponse(row);
  }

  @Patch('me/preferences')
  @RequirePermissions(ParentPermissions.READ_SELF)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Patch the calling parent\u2019s notification preferences (channels, opt-outs, quiet hours, locale, emergency override).',
  })
  @ApiOkResponse({ type: ParentMePreferenceResponseDto })
  @ApiForbiddenResponse({ description: 'Not a parent user or parent_portal disabled.' })
  @ApiResponse({ status: 409, description: 'Version conflict (stale If-Match).' })
  public async updateMine(
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ParentMePreferenceUpdateDto,
  ): Promise<ParentMePreferenceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.updateMine(expectedVersion, {
      ...(body.channelEmail !== undefined ? { channelEmail: body.channelEmail } : {}),
      ...(body.channelSms !== undefined ? { channelSms: body.channelSms } : {}),
      ...(body.channelWhatsapp !== undefined
        ? { channelWhatsapp: body.channelWhatsapp }
        : {}),
      ...(body.channelInApp !== undefined ? { channelInApp: body.channelInApp } : {}),
      ...(body.channelPush !== undefined ? { channelPush: body.channelPush } : {}),
      ...(body.emergencyOverride !== undefined
        ? { emergencyOverride: body.emergencyOverride }
        : {}),
      ...(body.categoryOptOuts !== undefined
        ? { categoryOptOuts: body.categoryOptOuts }
        : {}),
      ...(body.quietHoursStart !== undefined
        ? { quietHoursStart: body.quietHoursStart }
        : {}),
      ...(body.quietHoursEnd !== undefined
        ? { quietHoursEnd: body.quietHoursEnd }
        : {}),
      ...(body.quietHoursTimezone !== undefined
        ? { quietHoursTimezone: body.quietHoursTimezone }
        : {}),
      ...(body.locale !== undefined ? { locale: body.locale } : {}),
    });
    return toResponse(row);
  }
}

function toResponse(
  row: NotificationUserPreferenceRow,
): ParentMePreferenceResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    channelEmail: row.channelEmail,
    channelSms: row.channelSms,
    channelWhatsapp: row.channelWhatsapp,
    channelInApp: row.channelInApp,
    channelPush: row.channelPush,
    emergencyOverride: row.emergencyOverride,
    categoryOptOuts: normaliseOptOuts(row.categoryOptOuts),
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    quietHoursTimezone: row.quietHoursTimezone,
    locale: row.locale,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normaliseOptOuts(raw: unknown): Record<string, readonly string[]> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return out;
}
