/**
 * SchoolLifecycleController — `/super-admin/schools/:id/...` mutating
 * surface for activation, suspension, reactivation, and cancellation.
 *
 * Lives in `ProvisioningModule` (not SchoolModule) because the orchestrator
 * + lifecycle services collaborate across the school/plan/trial/identity
 * boundary; keeping the controller here avoids a circular module
 * dependency. Routes share the `/super-admin/schools` prefix with
 * SchoolRootController in SchoolModule.
 */
import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AllowWhenInactive } from '../../subscription';
import {
  CancelSchoolDto,
  SchoolResponseDto,
  SuspendSchoolDto,
} from '../../school/school/school.dto';
import { ProvisioningPermissions } from '../provisioning.constants';
import { SchoolLifecycleService } from './school-lifecycle.service';

@ApiTags('SuperAdmin · School Lifecycle')
@ApiBearerAuth()
@AllowWhenInactive()
@Controller({ path: 'super-admin/schools', version: '1' })
export class SchoolLifecycleController {
  constructor(private readonly service: SchoolLifecycleService) {}

  @Post(':id/activate')
  @RequirePermissions(ProvisioningPermissions.SCHOOL_ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Transition a TRIAL/SUSPENDED/EXPIRED school to ACTIVE (requires assigned plan).' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SchoolResponseDto> {
    return SchoolResponseDto.from(await this.service.activate(id, parseIfMatch(ifMatch)));
  }

  @Post(':id/suspend')
  @RequirePermissions(ProvisioningPermissions.SCHOOL_SUSPEND)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Suspend an ACTIVE school. Revokes all live sessions.' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async suspend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SuspendSchoolDto,
  ): Promise<SchoolResponseDto> {
    return SchoolResponseDto.from(
      await this.service.suspend(id, parseIfMatch(ifMatch), body.reason),
    );
  }

  @Post(':id/reactivate')
  @RequirePermissions(ProvisioningPermissions.SCHOOL_REACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reactivate a SUSPENDED school.' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SchoolResponseDto> {
    return SchoolResponseDto.from(await this.service.reactivate(id, parseIfMatch(ifMatch)));
  }

  @Post(':id/cancel')
  @RequirePermissions(ProvisioningPermissions.SCHOOL_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a school (terminal). Revokes all live sessions.' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelSchoolDto,
  ): Promise<SchoolResponseDto> {
    return SchoolResponseDto.from(
      await this.service.cancel(id, parseIfMatch(ifMatch), body.reason),
    );
  }
}
