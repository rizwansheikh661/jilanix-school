/**
 * ParentController — HTTP routes for `/api/v1/parents`. Wraps Parent
 * CRUD plus the link-student / unlink-student / list-students
 * sub-resources.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { ParentFeatureFlags, ParentPermissions } from '../parent.constants';
import {
  NotAParentUserError,
  ParentPortalDisabledError,
  ParentUserNotActiveError,
} from '../parent.errors';
import type { ParentRelationValue, ParentRow } from '../parent.types';
import { ParentUserService } from '../parent-user/parent-user.service';
import {
  CreateParentDto,
  LinkStudentDto,
  ParentListResponseDto,
  ParentResponseDto,
  ParentStudentLinkListResponseDto,
  ParentStudentLinkResponseDto,
  UpdateParentDto,
} from './parent.dto';
import { ParentService } from './parent.service';

class ParentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly q?: string;

  @IsOptional()
  @IsUUID()
  public readonly studentId?: string;
}

/**
 * Sprint 17 — projection of the calling parent's own `Parent` row down to
 * just the slot fields matching their `ParentUser.relation`. Avoids leaking
 * the other slot's contact info on the `/me/profile` response.
 */
export class ParentMeProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly parentId!: string;
  @ApiProperty() public readonly relation!: ParentRelationValue;
  @ApiProperty({ nullable: true }) public readonly name!: string | null;
  @ApiProperty({ nullable: true }) public readonly phone!: string | null;
  @ApiProperty({ nullable: true }) public readonly email!: string | null;
  @ApiProperty({ nullable: true }) public readonly occupation!: string | null;
  @ApiProperty() public readonly addressLine1!: string;
  @ApiProperty({ nullable: true }) public readonly addressLine2!: string | null;
  @ApiProperty() public readonly city!: string;
  @ApiProperty() public readonly state!: string;
  @ApiProperty() public readonly postalCode!: string;
  @ApiProperty() public readonly country!: string;
}

@ApiTags('Parents')
@ApiBearerAuth()
@Controller({ path: 'parents', version: '1' })
export class ParentController {
  constructor(
    private readonly service: ParentService,
    private readonly parentUsers: ParentUserService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Get()
  @RequirePermissions(ParentPermissions.READ)
  @ApiOperation({ summary: 'List parents; search + filter by student.' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiOkResponse({ type: ParentListResponseDto })
  public async list(@Query() query: ParentListQueryDto): Promise<ParentListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
    });
    return {
      items: result.items.map(ParentResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(ParentPermissions.CREATE)
  @ApiOperation({ summary: 'Create a parent record.' })
  @ApiCreatedResponse({ type: ParentResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'requires at least one phone contact' })
  public async create(@Body() body: CreateParentDto): Promise<ParentResponseDto> {
    return ParentResponseDto.from(await this.service.create(toCreate(body)));
  }

  // -----------------------------------------------------------------------
  // /me/* — parent-portal self-service surface. Declared BEFORE the `:id`
  // routes so the literal `me` segment matches first; the ParseUUIDPipe on
  // the `:id` routes would otherwise reject the request with 400.
  // -----------------------------------------------------------------------

  @Get('me/profile')
  @RequirePermissions(ParentPermissions.READ_SELF)
  @ApiOperation({
    summary:
      "Get the calling parent's profile, projected to just the relation-slot " +
      'fields belonging to this ParentUser (avoids leaking the other parent slot).',
  })
  @ApiOkResponse({ type: ParentMeProfileResponseDto })
  public async getMeProfile(): Promise<ParentMeProfileResponseDto> {
    await this.assertPortalEnabled();
    const parentUser = await this.requireActiveParentUser();
    const parent = await this.service.getById(parentUser.parentId);
    return projectParentForRelation(parent, parentUser.relation);
  }

  @Get('me/students')
  @RequirePermissions(ParentPermissions.READ_SELF)
  @ApiOperation({
    summary: "List the calling parent's linked students (parent-student links).",
  })
  @ApiOkResponse({ type: ParentStudentLinkListResponseDto })
  public async getMeStudents(): Promise<ParentStudentLinkListResponseDto> {
    await this.assertPortalEnabled();
    const parentUser = await this.requireActiveParentUser();
    const items = await this.service.listLinksForParent(parentUser.parentId);
    return { items: items.map(ParentStudentLinkResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(ParentPermissions.READ)
  @ApiOperation({ summary: 'Get a single parent.' })
  @ApiOkResponse({ type: ParentResponseDto })
  @ApiNotFoundResponse()
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<ParentResponseDto> {
    return ParentResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(ParentPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a parent record.' })
  @ApiOkResponse({ type: ParentResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse()
  @ApiConflictResponse({ description: 'version conflict' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateParentDto,
  ): Promise<ParentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return ParentResponseDto.from(await this.service.update(id, expectedVersion, toUpdate(body)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ParentPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a parent (blocked while student links exist).' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'parent still linked to students' })
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }

  @Get(':id/students')
  @RequirePermissions(ParentPermissions.READ)
  @ApiOperation({ summary: 'List the parent-student links for this parent.' })
  @ApiOkResponse({ type: ParentStudentLinkListResponseDto })
  @ApiNotFoundResponse()
  public async listLinks(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ParentStudentLinkListResponseDto> {
    const items = await this.service.listLinksForParent(id);
    return { items: items.map(ParentStudentLinkResponseDto.from) };
  }

  @Post(':id/link-student')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(ParentPermissions.LINK_STUDENT)
  @ApiOperation({ summary: 'Attach a parent to a student under the given relation slot.' })
  @ApiCreatedResponse({ type: ParentStudentLinkResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'duplicate link or per-student cap exceeded' })
  public async linkStudent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: LinkStudentDto,
  ): Promise<ParentStudentLinkResponseDto> {
    return ParentStudentLinkResponseDto.from(
      await this.service.linkStudent(id, {
        studentId: body.studentId,
        relation: body.relation,
        ...(body.isPrimaryContact !== undefined ? { isPrimaryContact: body.isPrimaryContact } : {}),
        ...(body.canPickup !== undefined ? { canPickup: body.canPickup } : {}),
      }),
    );
  }

  @Delete(':id/links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(ParentPermissions.UNLINK_STUDENT)
  @ApiOperation({ summary: 'Remove a parent-student link.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async unlinkStudent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('linkId', new ParseUUIDPipe()) linkId: string,
  ): Promise<void> {
    await this.service.unlinkStudent(id, linkId);
  }

  // -----------------------------------------------------------------------
  // helpers (parent-portal /me/* gating)
  // -----------------------------------------------------------------------

  private async assertPortalEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ParentFeatureFlags.PARENT_PORTAL,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new ParentPortalDisabledError();
    }
  }

  /**
   * Resolve the calling user → alive ParentUser row and assert it is ACTIVE.
   * Used by the `/me/*` endpoints — non-parents get 403 NOT_A_PARENT_USER,
   * suspended/archived parents get 403 ACCOUNT_SUSPENDED / ACCOUNT_ARCHIVED.
   */
  private async requireActiveParentUser() {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new NotAParentUserError();
    }
    const row = await this.parentUsers.findAliveByUserId(ctx.userId);
    if (row === null) {
      throw new NotAParentUserError();
    }
    if (row.status !== 'ACTIVE') {
      throw new ParentUserNotActiveError(row.status);
    }
    return row;
  }
}

/**
 * Slot-projection: from the full Parent row, return only the contact fields
 * for the relation slot the calling ParentUser belongs to. FATHER → father*
 * columns, MOTHER → mother* columns, GUARDIAN / GRANDPARENT / OTHER → the
 * guardian* slot. Address fields are always returned.
 */
function projectParentForRelation(
  parent: ParentRow,
  relation: ParentRelationValue,
): ParentMeProfileResponseDto {
  const slot = pickSlot(parent, relation);
  return {
    id: parent.id,
    parentId: parent.id,
    relation,
    name: slot.name,
    phone: slot.phone,
    email: slot.email,
    occupation: slot.occupation,
    addressLine1: parent.addressLine1,
    addressLine2: parent.addressLine2,
    city: parent.city,
    state: parent.state,
    postalCode: parent.postalCode,
    country: parent.country,
  };
}

function pickSlot(
  parent: ParentRow,
  relation: ParentRelationValue,
): {
  readonly name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly occupation: string | null;
} {
  switch (relation) {
    case 'FATHER':
      return {
        name: parent.fatherName,
        phone: parent.fatherPhone,
        email: parent.fatherEmail,
        occupation: parent.fatherOccupation,
      };
    case 'MOTHER':
      return {
        name: parent.motherName,
        phone: parent.motherPhone,
        email: parent.motherEmail,
        occupation: parent.motherOccupation,
      };
    case 'GUARDIAN':
    case 'GRANDPARENT':
    case 'OTHER':
    default:
      return {
        name: parent.guardianName,
        phone: parent.guardianPhone,
        email: parent.guardianEmail,
        occupation: parent.guardianOccupation,
      };
  }
}

function toCreate(body: CreateParentDto): Parameters<ParentService['create']>[0] {
  return {
    ...(body.fatherName !== undefined ? { fatherName: body.fatherName } : {}),
    ...(body.fatherPhone !== undefined ? { fatherPhone: body.fatherPhone } : {}),
    ...(body.fatherEmail !== undefined ? { fatherEmail: body.fatherEmail } : {}),
    ...(body.fatherOccupation !== undefined ? { fatherOccupation: body.fatherOccupation } : {}),
    ...(body.motherName !== undefined ? { motherName: body.motherName } : {}),
    ...(body.motherPhone !== undefined ? { motherPhone: body.motherPhone } : {}),
    ...(body.motherEmail !== undefined ? { motherEmail: body.motherEmail } : {}),
    ...(body.motherOccupation !== undefined ? { motherOccupation: body.motherOccupation } : {}),
    ...(body.guardianName !== undefined ? { guardianName: body.guardianName } : {}),
    ...(body.guardianPhone !== undefined ? { guardianPhone: body.guardianPhone } : {}),
    ...(body.guardianEmail !== undefined ? { guardianEmail: body.guardianEmail } : {}),
    ...(body.guardianOccupation !== undefined ? { guardianOccupation: body.guardianOccupation } : {}),
    ...(body.guardianRelation !== undefined ? { guardianRelation: body.guardianRelation } : {}),
    addressLine1: body.addressLine1,
    ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
    city: body.city,
    state: body.state,
    postalCode: body.postalCode,
    ...(body.country !== undefined ? { country: body.country } : {}),
  };
}

function toUpdate(body: UpdateParentDto): Parameters<ParentService['update']>[2] {
  const out: Record<string, unknown> = {};
  const keys: (keyof UpdateParentDto)[] = [
    'fatherName',
    'fatherPhone',
    'fatherEmail',
    'fatherOccupation',
    'motherName',
    'motherPhone',
    'motherEmail',
    'motherOccupation',
    'guardianName',
    'guardianPhone',
    'guardianEmail',
    'guardianOccupation',
    'guardianRelation',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'postalCode',
    'country',
  ];
  for (const k of keys) {
    if (body[k] !== undefined) {
      out[k] = body[k];
    }
  }
  return out as Parameters<ParentService['update']>[2];
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
