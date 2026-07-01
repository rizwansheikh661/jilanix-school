/**
 * UsageSelfController — tenant-facing read of own usage snapshot.
 * Mounts at `/v1/me/usage`. Pulls `schoolId` from the bound
 * RequestContext.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { SubscriptionPermissions } from '../subscription.constants';
import { SchoolUsageService } from './school-usage.service';
import { SchoolUsageResponseDto } from './usage.dto';

@ApiTags('Self · Usage')
@ApiBearerAuth()
@Controller({ path: 'me/usage', version: '1' })
export class UsageSelfController {
  constructor(private readonly service: SchoolUsageService) {}

  @Get()
  @RequirePermissions(SubscriptionPermissions.USAGE_SELF_READ)
  @ApiOperation({ summary: 'Read the current tenant usage snapshot.' })
  @ApiOkResponse({ type: SchoolUsageResponseDto })
  public async getMine(): Promise<SchoolUsageResponseDto> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('Tenant context required for /me/usage.');
    }
    return SchoolUsageResponseDto.from(await this.service.getSnapshot(ctx.schoolId));
  }
}
