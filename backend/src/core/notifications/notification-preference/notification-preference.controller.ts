/**
 * NotificationPreferenceController — `/api/v1/notifications/preferences/me`
 * routes. The user is taken from `RequestContext` — there is no admin path
 * here in Sprint 10.
 */
import { Body, Controller, Get, Headers, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import type { NotificationUserPreferenceRow } from '../notifications.types';
import {
  NotificationPreferenceResponseDto,
  UpdateNotificationPreferenceDto,
} from './notification-preference.dto';
import { NotificationPreferenceService } from './notification-preference.service';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@Controller('api/v1/notifications/preferences')
export class NotificationPreferenceController {
  constructor(private readonly service: NotificationPreferenceService) {}

  @Get('me')
  @RequirePermissions(NotificationsPermissions.PREFERENCE_READ)
  @ApiOperation({
    summary:
      'Get the current user notification preferences. Lazy-creates defaults on first read.',
  })
  @ApiOkResponse({ type: NotificationPreferenceResponseDto })
  public async getMine(): Promise<NotificationPreferenceResponseDto> {
    const row = await this.service.getOrCreateDefault();
    return toResponse(row);
  }

  @Patch('me')
  @RequirePermissions(NotificationsPermissions.PREFERENCE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Patch the current user notification preferences (channels, opt-outs, quiet hours, locale).',
  })
  @ApiOkResponse({ type: NotificationPreferenceResponseDto })
  @ApiResponse({ status: 409, description: 'Version conflict (stale If-Match).' })
  public async updateMine(
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(expectedVersion, {
      ...(body.channelEmail !== undefined ? { channelEmail: body.channelEmail } : {}),
      ...(body.channelSms !== undefined ? { channelSms: body.channelSms } : {}),
      ...(body.channelWhatsapp !== undefined
        ? { channelWhatsapp: body.channelWhatsapp }
        : {}),
      ...(body.channelInApp !== undefined ? { channelInApp: body.channelInApp } : {}),
      ...(body.categoryOptOuts !== undefined
        ? { categoryOptOuts: body.categoryOptOuts }
        : {}),
      ...(body.quietHoursStart !== undefined
        ? { quietHoursStart: body.quietHoursStart }
        : {}),
      ...(body.quietHoursEnd !== undefined ? { quietHoursEnd: body.quietHoursEnd } : {}),
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
): NotificationPreferenceResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    channelEmail: row.channelEmail,
    channelSms: row.channelSms,
    channelWhatsapp: row.channelWhatsapp,
    channelInApp: row.channelInApp,
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
