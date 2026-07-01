/**
 * BillingSettingsController — per-account billing settings (grace period,
 * reminders, default payment source). Mounts under
 * `/v1/platform/billing/accounts/:accountId/settings`.
 *
 * Feature-flag enforcement (`module.billing`) lives in the service layer.
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { BillingPermissions } from '../billing.constants';
import {
  BillingSettingsResponseDto,
  UpdateBillingSettingsDto,
} from './billing-settings.dto';
import { BillingSettingsService } from './billing-settings.service';

@ApiTags('Platform Admin · Billing Settings')
@ApiBearerAuth()
@Controller({
  path: 'platform/billing/accounts/:accountId/settings',
  version: '1',
})
export class BillingSettingsController {
  constructor(private readonly service: BillingSettingsService) {}

  @Get()
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'Read billing settings for an account.' })
  @ApiOkResponse({ type: BillingSettingsResponseDto })
  public async get(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<BillingSettingsResponseDto> {
    return BillingSettingsResponseDto.from(await this.service.getSettings(accountId));
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.SETTINGS_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update billing settings for an account.' })
  @ApiOkResponse({ type: BillingSettingsResponseDto })
  public async update(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBillingSettingsDto,
  ): Promise<BillingSettingsResponseDto> {
    const updated = await this.service.updateSettings(
      accountId,
      parseIfMatch(ifMatch),
      { ...body },
    );
    return BillingSettingsResponseDto.from(updated);
  }
}
