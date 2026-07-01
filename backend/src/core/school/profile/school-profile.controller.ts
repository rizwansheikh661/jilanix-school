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
import { SchoolProfileResponseDto, UpdateSchoolProfileDto } from './school-profile.dto';
import { SchoolProfileService, type UpdateSchoolProfileArgs } from './school-profile.service';

@ApiTags('SchoolProfile')
@ApiBearerAuth()
@Controller({ path: 'school/profile', version: '1' })
export class SchoolProfileController {
  constructor(private readonly service: SchoolProfileService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.PROFILE_READ)
  @ApiOperation({ summary: 'Read the school academic-identity profile (or null when not yet set).' })
  @ApiOkResponse({ type: SchoolProfileResponseDto })
  public async get(): Promise<SchoolProfileResponseDto | null> {
    const row = await this.service.findOrNull();
    return row === null ? null : SchoolProfileResponseDto.from(row);
  }

  @Put()
  @RequirePermissions(SchoolPermissions.PROFILE_UPDATE)
  @ApiOperation({ summary: 'Create or update the school profile (idempotent).' })
  @ApiHeader({
    name: 'If-Match',
    description: 'Required when a profile row already exists; supply current version.',
    required: false,
  })
  @ApiOkResponse({ type: SchoolProfileResponseDto })
  public async upsert(
    @Body() body: UpdateSchoolProfileDto,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SchoolProfileResponseDto> {
    const expectedVersion = parseOptionalIfMatch(ifMatch);
    const args: UpdateSchoolProfileArgs = {
      board: body.board,
      affiliationNumber: body.affiliationNumber,
      affiliationValidTill: body.affiliationValidTill === undefined
        ? undefined
        : body.affiliationValidTill === null
          ? null
          : new Date(body.affiliationValidTill),
      schoolType: body.schoolType,
      schoolCategory: body.schoolCategory,
      genderType: body.genderType,
      mediumOfInstruction: body.mediumOfInstruction,
      establishedYear: body.establishedYear,
      registrationNumber: body.registrationNumber,
      trustName: body.trustName,
      principalName: body.principalName,
      principalPhone: body.principalPhone,
      principalEmail: body.principalEmail,
      totalAreaSqft: body.totalAreaSqft,
      builtUpAreaSqft: body.builtUpAreaSqft,
      studentCapacity: body.studentCapacity,
      motto: body.motto,
      mission: body.mission,
      vision: body.vision,
    };
    const row = await this.service.update(expectedVersion, args);
    return SchoolProfileResponseDto.from(row);
  }
}

function parseOptionalIfMatch(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const stripped = raw.trim().replace(/^"|"$/g, '');
  if (!/^\d+$/.test(stripped)) return null;
  const parsed = Number.parseInt(stripped, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}
