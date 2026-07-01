import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { FeatureFlagPermissions } from '../feature-flag.constants';
import {
  AuditListQueryDto,
  AuditListResponseDto,
  AuditResponseDto,
} from '../feature-flag.dto';
import { FeatureFlagAuditRepository } from '../repositories/feature-flag-audit.repository';
import { FeatureFlagDefinitionRepository } from '../repositories/feature-flag-definition.repository';
import { UnknownFeatureFlagError } from '../feature-flag.errors';

@ApiTags('Feature flags')
@ApiBearerAuth('access-token')
@Controller({ path: 'feature-flags/audit', version: '1' })
export class FeatureFlagAuditController {
  constructor(
    private readonly audits: FeatureFlagAuditRepository,
    private readonly definitions: FeatureFlagDefinitionRepository,
  ) {}

  @Get()
  @RequirePermissions(FeatureFlagPermissions.AUDIT_READ)
  @ApiOkResponse({ type: AuditListResponseDto })
  public async list(@Query() query: AuditListQueryDto): Promise<AuditListResponseDto> {
    let flagId: string | undefined;
    if (query.flagKey !== undefined) {
      const def = await this.definitions.findByKey(query.flagKey);
      if (def === null) throw new UnknownFeatureFlagError(query.flagKey);
      flagId = def.id;
    }
    const rows = await this.audits.list({
      ...(flagId !== undefined ? { flagId } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.since !== undefined ? { since: new Date(query.since) } : {}),
      limit: Math.min(query.limit ?? 100, 500),
    });
    return { items: rows.map(AuditResponseDto.from) };
  }
}
