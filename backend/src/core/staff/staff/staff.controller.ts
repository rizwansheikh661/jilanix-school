/**
 * StaffController — HTTP routes for `/api/v1/staff`. The PII endpoint
 * is split out to a separate handler so the `staff.pii.read`
 * permission can gate it independently of plain `staff.read`.
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
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { StaffPermissions } from '../staff.constants';
import { STAFF_STATUS_VALUES, type StaffStatusValue } from '../staff.types';
import {
  CreateStaffDto,
  StaffListResponseDto,
  StaffPiiResponseDto,
  StaffResponseDto,
  UpdateStaffDto,
} from './staff.dto';
import { StaffService, type UpdateStaffArgs } from './staff.service';

class StaffListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(STAFF_STATUS_VALUES as unknown as object)
  public readonly status?: StaffStatusValue;

  @IsOptional() @IsString() @MaxLength(100)
  public readonly designation?: string;

  @IsOptional() @IsString() @MaxLength(100)
  public readonly department?: string;

  @IsOptional() @IsString() @MaxLength(120)
  public readonly q?: string;
}

@ApiTags('Staff')
@ApiBearerAuth()
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  @RequirePermissions(StaffPermissions.READ)
  @ApiOperation({ summary: 'List staff with filters and cursor pagination.' })
  @ApiQuery({ name: 'status', required: false, enum: STAFF_STATUS_VALUES as unknown as string[] })
  @ApiQuery({ name: 'designation', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: StaffListResponseDto })
  public async list(@Query() query: StaffListQueryDto): Promise<StaffListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.designation !== undefined ? { designation: query.designation } : {}),
      ...(query.department !== undefined ? { department: query.department } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
    });
    return {
      items: result.items.map(StaffResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(StaffPermissions.CREATE)
  @ApiOperation({ summary: 'Create a staff record; employeeCode auto-allocated.' })
  @ApiCreatedResponse({ type: StaffResponseDto })
  public async create(@Body() body: CreateStaffDto): Promise<StaffResponseDto> {
    return StaffResponseDto.from(
      await this.service.create({
        firstName: body.firstName,
        lastName: body.lastName,
        ...(body.dateOfBirth !== undefined ? { dateOfBirth: new Date(body.dateOfBirth) } : {}),
        gender: body.gender,
        ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        phone: body.phone,
        ...(body.alternatePhone !== undefined ? { alternatePhone: body.alternatePhone } : {}),
        ...(body.aadhaar !== undefined ? { aadhaar: body.aadhaar } : {}),
        ...(body.pan !== undefined ? { pan: body.pan } : {}),
        addressLine1: body.addressLine1,
        ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
        city: body.city,
        state: body.state,
        postalCode: body.postalCode,
        ...(body.country !== undefined ? { country: body.country } : {}),
        designation: body.designation,
        ...(body.department !== undefined ? { department: body.department } : {}),
        dateOfJoining: new Date(body.dateOfJoining),
        ...(body.bankAccount !== undefined ? { bankAccount: body.bankAccount } : {}),
        ...(body.bankIfsc !== undefined ? { bankIfsc: body.bankIfsc } : {}),
        ...(body.userId !== undefined ? { userId: body.userId } : {}),
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(StaffPermissions.READ)
  @ApiOperation({ summary: 'Get a staff record (PII masked).' })
  @ApiOkResponse({ type: StaffResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StaffResponseDto> {
    return StaffResponseDto.from(await this.service.getById(id));
  }

  @Get(':id/pii')
  @RequirePermissions(StaffPermissions.PII_READ)
  @ApiOperation({ summary: 'Get a staff record with decrypted PII (audited).' })
  @ApiOkResponse({ type: StaffPiiResponseDto })
  @ApiNotFoundResponse()
  public async getPii(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StaffPiiResponseDto> {
    return StaffPiiResponseDto.fromPii(await this.service.getPii(id));
  }

  @Patch(':id')
  @RequirePermissions(StaffPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a staff record.' })
  @ApiOkResponse({ type: StaffResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateStaffDto,
  ): Promise<StaffResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffResponseDto.from(await this.service.update(id, expectedVersion, toUpdate(body)));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.DEACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Mark staff INACTIVE.' })
  @ApiOkResponse({ type: StaffResponseDto })
  @ApiConflictResponse({ description: 'invalid status transition' })
  public async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StaffResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffResponseDto.from(await this.service.deactivate(id, expectedVersion));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StaffPermissions.REACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Mark staff ACTIVE.' })
  @ApiOkResponse({ type: StaffResponseDto })
  @ApiConflictResponse({ description: 'invalid status transition' })
  public async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StaffResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StaffResponseDto.from(await this.service.reactivate(id, expectedVersion));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(StaffPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a staff record.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}

function toUpdate(body: UpdateStaffDto): UpdateStaffArgs {
  const out: Record<string, unknown> = {};
  const passthrough: (keyof UpdateStaffDto)[] = [
    'firstName',
    'lastName',
    'gender',
    'bloodGroup',
    'photoUrl',
    'email',
    'phone',
    'alternatePhone',
    'aadhaar',
    'pan',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'postalCode',
    'country',
    'designation',
    'department',
    'bankAccount',
    'bankIfsc',
    'userId',
  ];
  for (const k of passthrough) {
    if (body[k] !== undefined) {
      out[k] = body[k];
    }
  }
  if (body.dateOfBirth !== undefined) out.dateOfBirth = new Date(body.dateOfBirth);
  if (body.dateOfJoining !== undefined) out.dateOfJoining = new Date(body.dateOfJoining);
  if (body.dateOfLeaving !== undefined) out.dateOfLeaving = new Date(body.dateOfLeaving);
  return out as UpdateStaffArgs;
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
