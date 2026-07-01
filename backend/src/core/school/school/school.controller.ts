/**
 * SchoolController — `/super-admin/schools` read/patch surface.
 *
 * Wave 3 ships:
 *   - GET    /v1/super-admin/schools         (cursor-paginated list)
 *   - GET    /v1/super-admin/schools/:id     (single read)
 *   - PATCH  /v1/super-admin/schools/:id     (legal/contact fields only)
 *
 * Lifecycle endpoints (suspend, cancel, extend-trial, assign-plan) land
 * in Wave 4-6 on a sibling controller.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { SchoolPermissions } from '../school.constants';
import {
  SchoolListQueryDto,
  SchoolListResponseDto,
  SchoolResponseDto,
  UpdateSchoolDto,
} from './school.dto';
import { SchoolRootService } from './school.service';

@ApiTags('SuperAdmin · Schools')
@ApiBearerAuth()
@Controller({ path: 'super-admin/schools', version: '1' })
export class SchoolRootController {
  constructor(private readonly service: SchoolRootService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.LIFECYCLE_READ)
  @ApiOperation({ summary: 'List schools (cursor paginated). Filterable by lifecycle status, plan, slug search.' })
  @ApiOkResponse({ type: SchoolListResponseDto })
  public async list(@Query() query: SchoolListQueryDto): Promise<SchoolListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.lifecycleStatus !== undefined
        ? { lifecycleStatus: query.lifecycleStatus }
        : {}),
      ...(query.planId !== undefined ? { planId: query.planId } : {}),
      ...(query.slugSearch !== undefined ? { slugSearch: query.slugSearch } : {}),
      ...(query.includeDeleted !== undefined ? { includeDeleted: query.includeDeleted } : {}),
    });
    return {
      items: items.map(SchoolResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(SchoolPermissions.LIFECYCLE_READ)
  @ApiOperation({ summary: 'Read a single school (super-admin view).' })
  @ApiOkResponse({ type: SchoolResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SchoolResponseDto> {
    return SchoolResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(SchoolPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update legal + contact fields. Lifecycle transitions are out of scope here.' })
  @ApiOkResponse({ type: SchoolResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSchoolDto,
  ): Promise<SchoolResponseDto> {
    const row = await this.service.update(id, parseIfMatch(ifMatch), {
      ...(body.legalName !== undefined ? { legalName: body.legalName } : {}),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.gstin !== undefined ? { gstin: body.gstin } : {}),
      ...(body.pan !== undefined ? { pan: body.pan } : {}),
      ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
      ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.stateCode !== undefined ? { stateCode: body.stateCode } : {}),
      ...(body.pincode !== undefined ? { pincode: body.pincode } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.website !== undefined ? { website: body.website } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.localeDefault !== undefined ? { localeDefault: body.localeDefault } : {}),
    });
    return SchoolResponseDto.from(row);
  }
}
