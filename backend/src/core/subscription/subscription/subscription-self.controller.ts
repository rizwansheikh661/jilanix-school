/**
 * SubscriptionSelfController — tenant-facing read of the school's own
 * active subscription. Mounts at `/v1/me/subscription`. Pulls `schoolId`
 * from the bound RequestContext so a tenant user cannot see another
 * tenant's subscription.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { SubscriptionPermissions } from '../subscription.constants';
import { SubscriptionResponseDto } from './subscription.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('Self · Subscription')
@ApiBearerAuth()
@Controller({ path: 'me/subscription', version: '1' })
export class SubscriptionSelfController {
  constructor(private readonly service: SubscriptionService) {}

  @Get()
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_SELF_READ)
  @ApiOperation({ summary: 'Read the active subscription for the current tenant.' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async getMine(): Promise<SubscriptionResponseDto> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('Tenant context required for /me/subscription.');
    }
    return SubscriptionResponseDto.from(await this.service.getActive(ctx.schoolId));
  }
}
