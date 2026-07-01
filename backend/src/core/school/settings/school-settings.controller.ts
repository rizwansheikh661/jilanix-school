/**
 * SchoolSettingsController — `/school/settings` for the tenant on the
 * request context. GET materialises defaults on first call; PATCH requires
 * If-Match.
 */
import { Body, Controller, Get, Headers, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { SchoolPermissions } from '../school.constants';
import { SchoolSettingsResponseDto, UpdateSchoolSettingsDto } from './school-settings.dto';
import { SchoolSettingsService } from './school-settings.service';

@ApiTags('SchoolSettings')
@ApiBearerAuth()
@Controller({ path: 'school/settings', version: '1' })
export class SchoolSettingsController {
  constructor(private readonly service: SchoolSettingsService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.SETTINGS_READ)
  @ApiOperation({ summary: 'Read the school operational settings. Materialises defaults on first call.' })
  @ApiOkResponse({ type: SchoolSettingsResponseDto })
  public async get(): Promise<SchoolSettingsResponseDto> {
    return SchoolSettingsResponseDto.from(await this.service.getOrCreateForCurrentSchool());
  }

  @Patch()
  @RequirePermissions(SchoolPermissions.SETTINGS_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Patch the school operational settings.' })
  @ApiOkResponse({ type: SchoolSettingsResponseDto })
  public async update(
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSchoolSettingsDto,
  ): Promise<SchoolSettingsResponseDto> {
    const row = await this.service.update(parseIfMatch(ifMatch), {
      ...(body.workingDaysJson !== undefined
        ? {
            workingDaysJson: {
              mon: body.workingDaysJson.mon,
              tue: body.workingDaysJson.tue,
              wed: body.workingDaysJson.wed,
              thu: body.workingDaysJson.thu,
              fri: body.workingDaysJson.fri,
              sat: body.workingDaysJson.sat,
              sun: body.workingDaysJson.sun,
            },
          }
        : {}),
      ...(body.attendanceWindowHours !== undefined
        ? { attendanceWindowHours: body.attendanceWindowHours }
        : {}),
      ...(body.examEditWindowHours !== undefined
        ? { examEditWindowHours: body.examEditWindowHours }
        : {}),
      ...(body.invoiceNumberFormat !== undefined
        ? { invoiceNumberFormat: body.invoiceNumberFormat }
        : {}),
      ...(body.defaultCommunicationLanguage !== undefined
        ? { defaultCommunicationLanguage: body.defaultCommunicationLanguage }
        : {}),
      ...(body.quietHoursStart !== undefined ? { quietHoursStart: body.quietHoursStart } : {}),
      ...(body.quietHoursEnd !== undefined ? { quietHoursEnd: body.quietHoursEnd } : {}),
      ...(body.privacyPolicyVersion !== undefined
        ? { privacyPolicyVersion: body.privacyPolicyVersion }
        : {}),
      ...(body.privacyPolicyAcceptedAt !== undefined
        ? {
            privacyPolicyAcceptedAt:
              body.privacyPolicyAcceptedAt === null ? null : new Date(body.privacyPolicyAcceptedAt),
          }
        : {}),
    });
    return SchoolSettingsResponseDto.from(row);
  }
}
