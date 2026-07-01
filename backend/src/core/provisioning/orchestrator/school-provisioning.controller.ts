/**
 * SchoolProvisioningController — orchestrator entry points.
 *
 *   - POST /v1/super-admin/schools           (provision a brand-new tenant)
 *   - POST /v1/super-admin/schools/:id/plan  (re-assign a plan)
 *
 * Sibling controllers (read/patch/lifecycle/trial) share the
 * `/super-admin/schools` prefix; Nest happily routes by method+path
 * regardless of which controller owns the handler.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { SchoolResponseDto } from '../../school/school/school.dto';
import { ProvisioningPermissions } from '../provisioning.constants';
import {
  AssignPlanDto,
  ProvisionSchoolDto,
  ProvisionSchoolResponseDto,
} from './school-provisioning.dto';
import { SchoolProvisioningService } from './school-provisioning.service';

@ApiTags('SuperAdmin · Provisioning')
@ApiBearerAuth()
@Controller({ path: 'super-admin/schools', version: '1' })
export class SchoolProvisioningController {
  constructor(private readonly service: SchoolProvisioningService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(ProvisioningPermissions.SCHOOL_CREATE)
  @ApiOperation({
    summary:
      'Provision a brand-new school tenant (creates school + settings + branch + ' +
      'academic year + admin user + entitlements + outbox event in one saga). ' +
      'Returns the seeded admin email + ONE-TIME cleartext password.',
  })
  @ApiCreatedResponse({ type: ProvisionSchoolResponseDto })
  public async provision(@Body() body: ProvisionSchoolDto): Promise<ProvisionSchoolResponseDto> {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new Error('SchoolProvisioningController.provision requires an authenticated user.');
    }
    const input: Parameters<SchoolProvisioningService['provisionSchool']>[0] = {
      slug: body.slug,
      legalName: body.legalName,
      displayName: body.displayName,
      planId: body.planId,
      triggeredByUserId: ctx.userId,
      ...(body.countryCode !== undefined ? { countryCode: body.countryCode } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.localeDefault !== undefined ? { localeDefault: body.localeDefault } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
      ...(body.trialDays !== undefined ? { trialDays: body.trialDays } : {}),
    };
    return ProvisionSchoolResponseDto.from(await this.service.provisionSchool(input));
  }

  @Post(':id/plan')
  @RequirePermissions(ProvisioningPermissions.PLAN_ASSIGN)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary:
      'Re-assign a plan to an existing school. Syncs communication ' +
      'entitlements to the new plan caps and publishes PLAN_ASSIGNED.',
  })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async assignPlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AssignPlanDto,
  ): Promise<SchoolResponseDto> {
    const args: Parameters<SchoolProvisioningService['assignPlan']>[0] = {
      schoolId: id,
      expectedVersion: parseIfMatch(ifMatch),
      planId: body.planId,
      ...(body.expiresInDays !== undefined ? { expiresInDays: body.expiresInDays } : {}),
    };
    return SchoolResponseDto.from(await this.service.assignPlan(args));
  }
}
