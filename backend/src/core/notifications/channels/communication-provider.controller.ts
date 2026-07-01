/**
 * CommunicationProviderController — super-admin listing of registered
 * communication channel adapters with their per-flag enabled state.
 *
 * Route: GET /api/v1/admin/comms/providers
 *
 * For each registered adapter we evaluate the gating flag against the
 * system context (no school) so the response describes the platform-wide
 * default — NOT a per-school evaluation. Per-school overrides are visible
 * via the feature-flag admin surface.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';

import type { ChannelCode, ProviderCode } from './communication-channel.port';
import { CommunicationChannelRegistry } from './communication-channel.registry';

export interface CommunicationProviderListItem {
  readonly channel: ChannelCode;
  readonly providerCode: ProviderCode;
  readonly isDefault: boolean;
  readonly enabled: boolean;
}

export interface CommunicationProviderListResponse {
  readonly items: readonly CommunicationProviderListItem[];
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'admin/comms/providers', version: '1' })
export class CommunicationProviderController {
  constructor(
    private readonly registry: CommunicationChannelRegistry,
    private readonly flags: FeatureFlagService,
  ) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.PROVIDER_ADMIN_READ)
  @ApiOperation({
    summary:
      'List registered channel adapters with their per-flag enabled state (platform-wide).',
  })
  @ApiOkResponse()
  public async list(): Promise<CommunicationProviderListResponse> {
    const registered = this.registry.listRegistered();
    const items: CommunicationProviderListItem[] = [];
    for (const entry of registered) {
      const flagKey =
        entry.channel === 'IN_APP'
          ? 'comms.channel.in_app'
          : `comms.provider.${entry.providerCode}`;
      const enabled = await this.flags.isEnabled(flagKey, { schoolId: null });
      items.push({
        channel: entry.channel,
        providerCode: entry.providerCode,
        isDefault: entry.isDefault,
        enabled,
      });
    }
    return { items };
  }
}
