import { Body, Controller, Get, Headers, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { SchoolPermissions } from '../school.constants';
import { SchoolBrandingResponseDto, UpdateSchoolBrandingDto } from './school-branding.dto';
import { SchoolBrandingService } from './school-branding.service';

@ApiTags('SchoolBranding')
@ApiBearerAuth()
@Controller({ path: 'school/branding', version: '1' })
export class SchoolBrandingController {
  constructor(private readonly service: SchoolBrandingService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.BRANDING_READ)
  @ApiOperation({ summary: 'Read the school branding (or null when not yet set).' })
  @ApiOkResponse({ type: SchoolBrandingResponseDto })
  public async get(): Promise<SchoolBrandingResponseDto | null> {
    const row = await this.service.findOrNull();
    return row === null ? null : SchoolBrandingResponseDto.from(row);
  }

  @Put()
  @RequirePermissions(SchoolPermissions.BRANDING_UPDATE)
  @ApiOperation({ summary: 'Create or update the school branding (idempotent).' })
  @ApiHeader({ name: 'If-Match', required: false })
  @ApiOkResponse({ type: SchoolBrandingResponseDto })
  public async upsert(
    @Body() body: UpdateSchoolBrandingDto,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SchoolBrandingResponseDto> {
    const expectedVersion = parseOptionalIfMatch(ifMatch);
    const row = await this.service.update(expectedVersion, {
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl,
      letterheadUrl: body.letterheadUrl,
      brandPrimaryHex: body.brandPrimaryHex,
      brandSecondaryHex: body.brandSecondaryHex,
      brandAccentHex: body.brandAccentHex,
      fontFamily: body.fontFamily,
      tagline: body.tagline,
    });
    return SchoolBrandingResponseDto.from(row);
  }
}

function parseOptionalIfMatch(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const stripped = raw.trim().replace(/^"|"$/g, '');
  if (!/^\d+$/.test(stripped)) return null;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}
