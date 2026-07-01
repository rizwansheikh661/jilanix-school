import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { BranchPermissions } from '../branch.constants';
import { BranchSettingsResponseDto, UpdateBranchSettingsDto } from './branch-settings.dto';
import { BranchSettingsService } from './branch-settings.service';

@ApiTags('BranchSettings')
@ApiBearerAuth()
@Controller({ path: 'branches/:id/settings', version: '1' })
export class BranchSettingsController {
  constructor(private readonly service: BranchSettingsService) {}

  @Get()
  @RequirePermissions(BranchPermissions.SETTINGS_READ)
  @ApiOperation({ summary: 'Read branch settings (or null when not yet set).' })
  @ApiOkResponse({ type: BranchSettingsResponseDto })
  @ApiNotFoundResponse()
  public async get(
    @Param('id', new ParseUUIDPipe()) branchId: string,
  ): Promise<BranchSettingsResponseDto | null> {
    const row = await this.service.findOrNull(branchId);
    return row === null ? null : BranchSettingsResponseDto.from(row);
  }

  @Put()
  @RequirePermissions(BranchPermissions.SETTINGS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: false })
  @ApiOperation({ summary: 'Create or update branch settings.' })
  @ApiOkResponse({ type: BranchSettingsResponseDto })
  public async upsert(
    @Param('id', new ParseUUIDPipe()) branchId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBranchSettingsDto,
  ): Promise<BranchSettingsResponseDto> {
    const expectedVersion = parseOptionalIfMatch(ifMatch);
    return BranchSettingsResponseDto.from(
      await this.service.upsert(branchId, expectedVersion, {
        workingDaysJson: body.workingDaysJson,
        periodSettingsJson: body.periodSettingsJson,
        attendanceWindowOverrideHours: body.attendanceWindowOverrideHours,
        primaryLanguage: body.primaryLanguage,
      }),
    );
  }
}

function parseOptionalIfMatch(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const stripped = raw.trim().replace(/^"|"$/g, '');
  if (!/^\d+$/.test(stripped)) return null;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}
