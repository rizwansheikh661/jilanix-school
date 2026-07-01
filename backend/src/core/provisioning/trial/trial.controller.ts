/**
 * TrialController — `/v1/super-admin/schools/:id/trial/extend` endpoint.
 *
 * Lives in ProvisioningModule sibling to SchoolLifecycleController. The
 * trial extension is the only mutator on this resource — the read-only
 * "current trial state" is already surfaced by `GET /super-admin/schools/:id`
 * (SchoolResponseDto carries trial fields).
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
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { SchoolResponseDto } from '../../school/school/school.dto';
import { ProvisioningPermissions } from '../provisioning.constants';
import { TrialService } from './trial.service';

export class ExtendTrialDto {
  @ApiProperty({ minimum: 1, maximum: 365, description: 'Number of days to extend the trial.' })
  @IsInt()
  @Min(1)
  @Max(365)
  public readonly additionalDays!: number;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  public readonly reason?: string;
}

@ApiTags('SuperAdmin · Trial')
@ApiBearerAuth()
@Controller({ path: 'super-admin/schools', version: '1' })
export class TrialController {
  constructor(private readonly service: TrialService) {}

  @Post(':id/trial/extend')
  @RequirePermissions(ProvisioningPermissions.TRIAL_EXTEND)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Extend the trial period for a TRIAL school (max 3 extensions per school).' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async extend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ExtendTrialDto,
  ): Promise<SchoolResponseDto> {
    const args: Parameters<TrialService['extend']>[0] = {
      schoolId: id,
      expectedVersion: parseIfMatch(ifMatch),
      additionalDays: body.additionalDays,
    };
    if (body.reason !== undefined) {
      (args as { reason?: string }).reason = body.reason;
    }
    return SchoolResponseDto.from(await this.service.extend(args));
  }
}
