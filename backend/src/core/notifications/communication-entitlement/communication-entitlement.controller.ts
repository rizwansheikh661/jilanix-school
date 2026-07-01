/**
 * Communication entitlement controllers — tenant + super-admin.
 *
 * Tenant routes live under `/api/v1/comms/...` (self-service read).
 * Super-admin routes live under `/api/v1/admin/comms/...` and run the
 * platform-scope guard inside the service layer (actorScope === 'global').
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import {
  CommunicationEntitlementListResponseDto,
  CommunicationEntitlementResponseDto,
  CommunicationUsageListResponseDto,
  CommunicationUsageResponseDto,
  ListEntitlementsQueryDto,
  UpdateCommunicationEntitlementDto,
  UsageQueryDto,
} from './communication-entitlement.dto';
import { CommunicationEntitlementService } from './communication-entitlement.service';

@ApiTags('Communication Entitlements')
@ApiBearerAuth()
@Controller({ path: 'comms', version: '1' })
export class CommunicationEntitlementController {
  constructor(private readonly service: CommunicationEntitlementService) {}

  @Get('entitlements/me')
  @RequirePermissions(NotificationsPermissions.ENTITLEMENT_READ)
  @ApiOperation({ summary: 'Read the current school\u2019s communication entitlement.' })
  @ApiOkResponse({ type: CommunicationEntitlementResponseDto })
  public async getOrCreateForCurrentSchool(): Promise<CommunicationEntitlementResponseDto> {
    const row = await this.service.getOrCreateForCurrentSchool();
    return CommunicationEntitlementResponseDto.from(row);
  }

  @Get('usage/me')
  @RequirePermissions(NotificationsPermissions.USAGE_READ)
  @ApiOperation({ summary: 'Read the current school\u2019s monthly usage snapshot.' })
  @ApiOkResponse({ type: CommunicationUsageResponseDto })
  public async getUsageSnapshot(): Promise<CommunicationUsageResponseDto> {
    const snapshot = await this.service.getUsageSnapshot();
    return toUsageDto(snapshot);
  }
}

@ApiTags('Communication Entitlements')
@ApiBearerAuth()
@Controller({ path: 'admin/comms', version: '1' })
export class CommunicationEntitlementAdminController {
  constructor(private readonly service: CommunicationEntitlementService) {}

  @Get('entitlements')
  @RequirePermissions(NotificationsPermissions.ENTITLEMENT_ADMIN_READ)
  @ApiOperation({
    summary: 'Super-admin: list communication entitlements across schools.',
  })
  @ApiOkResponse({ type: CommunicationEntitlementListResponseDto })
  public async listAll(
    @Query() query: ListEntitlementsQueryDto,
  ): Promise<CommunicationEntitlementListResponseDto> {
    const page = await this.service.listAll({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return {
      items: page.items.map(CommunicationEntitlementResponseDto.from),
      nextCursor: page.nextCursor,
    };
  }

  @Get('entitlements/:schoolId')
  @RequirePermissions(NotificationsPermissions.ENTITLEMENT_ADMIN_READ)
  @ApiOperation({ summary: 'Super-admin: read a school\u2019s communication entitlement.' })
  @ApiParam({ name: 'schoolId', description: 'Target school UUID.' })
  @ApiOkResponse({ type: CommunicationEntitlementResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<CommunicationEntitlementResponseDto> {
    const row = await this.service.getOne(schoolId);
    return CommunicationEntitlementResponseDto.from(row);
  }

  @Patch('entitlements/:schoolId')
  @RequirePermissions(NotificationsPermissions.ENTITLEMENT_ADMIN_UPDATE)
  @ApiOperation({
    summary:
      'Super-admin: update enable flags / monthly limits / trial for a school.',
  })
  @ApiParam({ name: 'schoolId', description: 'Target school UUID.' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: CommunicationEntitlementResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateCommunicationEntitlementDto,
  ): Promise<CommunicationEntitlementResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(schoolId, expectedVersion, {
      ...(body.emailEnabled !== undefined ? { emailEnabled: body.emailEnabled } : {}),
      ...(body.smsEnabled !== undefined ? { smsEnabled: body.smsEnabled } : {}),
      ...(body.whatsappEnabled !== undefined ? { whatsappEnabled: body.whatsappEnabled } : {}),
      ...(body.inAppEnabled !== undefined ? { inAppEnabled: body.inAppEnabled } : {}),
      ...(body.emailMonthlyLimit !== undefined
        ? { emailMonthlyLimit: body.emailMonthlyLimit }
        : {}),
      ...(body.smsMonthlyLimit !== undefined
        ? { smsMonthlyLimit: body.smsMonthlyLimit }
        : {}),
      ...(body.whatsappMonthlyLimit !== undefined
        ? { whatsappMonthlyLimit: body.whatsappMonthlyLimit }
        : {}),
      ...(body.isTrial !== undefined ? { isTrial: body.isTrial } : {}),
      ...(body.trialExpiresAt !== undefined
        ? {
            trialExpiresAt:
              body.trialExpiresAt === null ? null : new Date(body.trialExpiresAt),
          }
        : {}),
    });
    return CommunicationEntitlementResponseDto.from(row);
  }

  @Post('entitlements/:schoolId/reset-usage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(NotificationsPermissions.ENTITLEMENT_ADMIN_RESET_USAGE)
  @ApiOperation({
    summary:
      'Super-admin: reset a school\u2019s monthly usage counters and roll the period to the current month.',
  })
  @ApiParam({ name: 'schoolId', description: 'Target school UUID.' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: CommunicationEntitlementResponseDto })
  @ApiNotFoundResponse()
  public async resetUsage(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<CommunicationEntitlementResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.resetUsage(schoolId, expectedVersion);
    return CommunicationEntitlementResponseDto.from(row);
  }

  @Get('usage')
  @RequirePermissions(NotificationsPermissions.USAGE_ADMIN_READ)
  @ApiOperation({
    summary: 'Super-admin: list monthly usage across schools (optional month filter).',
  })
  @ApiOkResponse({ type: CommunicationUsageListResponseDto })
  @ApiResponse({ status: 200, description: 'List of per-school usage snapshots.' })
  public async getCrossSchoolUsage(
    @Query() query: UsageQueryDto,
  ): Promise<CommunicationUsageListResponseDto> {
    const page = await this.service.getCrossSchoolUsage(query.period);
    return {
      items: page.items.map(toUsageDto),
      nextCursor: page.nextCursor,
    };
  }
}

function toUsageDto(snapshot: {
  readonly schoolId: string;
  readonly period: { readonly start: Date; readonly end: Date };
  readonly email: { readonly used: number; readonly limit: number | null };
  readonly sms: { readonly used: number; readonly limit: number | null };
  readonly whatsapp: { readonly used: number; readonly limit: number | null };
}): CommunicationUsageResponseDto {
  return {
    schoolId: snapshot.schoolId,
    period: {
      start: snapshot.period.start.toISOString(),
      end: snapshot.period.end.toISOString(),
    },
    email: { used: snapshot.email.used, limit: snapshot.email.limit },
    sms: { used: snapshot.sms.used, limit: snapshot.sms.limit },
    whatsapp: { used: snapshot.whatsapp.used, limit: snapshot.whatsapp.limit },
  };
}
