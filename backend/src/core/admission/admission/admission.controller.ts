/**
 * AdmissionController — HTTP routes for `/api/v1/admissions`. Wraps the
 * admission CRUD + workflow transitions + history list.
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
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { AdmissionPermissions } from '../admission.constants';
import {
  ADMISSION_STATUS_VALUES,
  type AdmissionStatusValue,
} from '../admission.types';
import {
  AdmissionDecisionDto,
  AdmissionHistoryListResponseDto,
  AdmissionHistoryResponseDto,
  AdmissionListResponseDto,
  AdmissionResponseDto,
  ApproveAdmissionDto,
  ApproveAdmissionResponseDto,
  CreateAdmissionDto,
  UpdateAdmissionDto,
} from './admission.dto';
import { AdmissionService } from './admission.service';

class AdmissionListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ADMISSION_STATUS_VALUES as unknown as object)
  public readonly status?: AdmissionStatusValue;

  @IsOptional()
  @IsUUID()
  public readonly targetAcademicYearId?: string;

  @IsOptional()
  @IsUUID()
  public readonly targetClassId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly q?: string;
}

@ApiTags('Admissions')
@ApiBearerAuth()
@Controller({ path: 'admissions', version: '1' })
export class AdmissionController {
  constructor(private readonly service: AdmissionService) {}

  @Get()
  @RequirePermissions(AdmissionPermissions.READ)
  @ApiOperation({ summary: 'List admissions with filters and cursor pagination.' })
  @ApiQuery({ name: 'status', required: false, enum: ADMISSION_STATUS_VALUES as unknown as string[] })
  @ApiQuery({ name: 'targetAcademicYearId', required: false })
  @ApiQuery({ name: 'targetClassId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: AdmissionListResponseDto })
  public async list(@Query() query: AdmissionListQueryDto): Promise<AdmissionListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.targetAcademicYearId !== undefined
        ? { targetAcademicYearId: query.targetAcademicYearId }
        : {}),
      ...(query.targetClassId !== undefined ? { targetClassId: query.targetClassId } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
    });
    return {
      items: result.items.map(AdmissionResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(AdmissionPermissions.CREATE)
  @ApiOperation({ summary: 'Create a new admission record (DRAFT).' })
  @ApiCreatedResponse({ type: AdmissionResponseDto })
  public async create(@Body() body: CreateAdmissionDto): Promise<AdmissionResponseDto> {
    return AdmissionResponseDto.from(
      await this.service.create({
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: new Date(body.dateOfBirth),
        gender: body.gender,
        ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
        targetAcademicYearId: body.targetAcademicYearId,
        targetClassId: body.targetClassId,
        targetSectionId: body.targetSectionId,
        ...(body.admissionNo !== undefined ? { admissionNo: body.admissionNo } : {}),
        ...(body.rollNo !== undefined ? { rollNo: body.rollNo } : {}),
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
        ...(body.religion !== undefined ? { religion: body.religion } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.nationality !== undefined ? { nationality: body.nationality } : {}),
        ...(body.motherTongue !== undefined ? { motherTongue: body.motherTongue } : {}),
        ...(body.aadhaar !== undefined ? { aadhaar: body.aadhaar } : {}),
        ...(body.apaarId !== undefined ? { apaarId: body.apaarId } : {}),
        ...(body.isCwsn !== undefined ? { isCwsn: body.isCwsn } : {}),
        ...(body.disabilityType !== undefined ? { disabilityType: body.disabilityType } : {}),
        ...(body.isRte !== undefined ? { isRte: body.isRte } : {}),
        ...(body.isMinority !== undefined ? { isMinority: body.isMinority } : {}),
        ...(body.minorityCommunity !== undefined
          ? { minorityCommunity: body.minorityCommunity }
          : {}),
        ...(body.isBpl !== undefined ? { isBpl: body.isBpl } : {}),
        ...(body.previousSchoolName !== undefined
          ? { previousSchoolName: body.previousSchoolName }
          : {}),
        ...(body.previousSchoolTcNo !== undefined
          ? { previousSchoolTcNo: body.previousSchoolTcNo }
          : {}),
        ...(body.previousSchoolTcDate !== undefined
          ? {
              previousSchoolTcDate:
                body.previousSchoolTcDate === null ? null : new Date(body.previousSchoolTcDate),
            }
          : {}),
        ...(body.admissionType !== undefined ? { admissionType: body.admissionType } : {}),
        ...(body.placeOfBirth !== undefined ? { placeOfBirth: body.placeOfBirth } : {}),
        ...(body.birthCertNo !== undefined ? { birthCertNo: body.birthCertNo } : {}),
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(AdmissionPermissions.READ)
  @ApiOperation({ summary: 'Get a single admission.' })
  @ApiOkResponse({ type: AdmissionResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdmissionResponseDto> {
    return AdmissionResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(AdmissionPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update a DRAFT admission.' })
  @ApiOkResponse({ type: AdmissionResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse()
  @ApiConflictResponse({ description: 'version conflict or not DRAFT' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateAdmissionDto,
  ): Promise<AdmissionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AdmissionResponseDto.from(
      await this.service.update(id, expectedVersion, toUpdate(body)),
    );
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdmissionPermissions.SUBMIT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Submit a DRAFT admission for review.' })
  @ApiOkResponse({ type: AdmissionResponseDto })
  @ApiConflictResponse({ description: 'version conflict or invalid transition' })
  public async submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<AdmissionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AdmissionResponseDto.from(await this.service.submit(id, expectedVersion));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdmissionPermissions.APPROVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Approve a SUBMITTED admission — creates the Student + Parent rows.',
  })
  @ApiOkResponse({ type: ApproveAdmissionResponseDto })
  @ApiConflictResponse({ description: 'invalid transition or already decided' })
  @ApiUnprocessableEntityResponse({ description: 'missing fields required for approval' })
  public async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ApproveAdmissionDto,
  ): Promise<ApproveAdmissionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const result = await this.service.approve(id, expectedVersion, {
      ...(body.rollNo !== undefined ? { rollNo: body.rollNo } : {}),
      ...(body.admittedOn !== undefined ? { admittedOn: new Date(body.admittedOn) } : {}),
      ...(body.emergencyContacts !== undefined
        ? { emergencyContacts: body.emergencyContacts }
        : {}),
      ...(body.decisionNote !== undefined ? { decisionNote: body.decisionNote } : {}),
    });
    return {
      admission: AdmissionResponseDto.from(result.admission),
      studentId: result.student.id,
      parentId: result.parent.id,
      linkId: result.link.id,
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdmissionPermissions.REJECT)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reject a SUBMITTED admission.' })
  @ApiOkResponse({ type: AdmissionResponseDto })
  @ApiConflictResponse({ description: 'invalid transition' })
  public async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AdmissionDecisionDto,
  ): Promise<AdmissionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AdmissionResponseDto.from(
      await this.service.reject(id, expectedVersion, {
        ...(body.decisionNote !== undefined ? { decisionNote: body.decisionNote } : {}),
      }),
    );
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AdmissionPermissions.WITHDRAW)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Withdraw a DRAFT or SUBMITTED admission.' })
  @ApiOkResponse({ type: AdmissionResponseDto })
  @ApiConflictResponse({ description: 'invalid transition' })
  public async withdraw(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AdmissionDecisionDto,
  ): Promise<AdmissionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return AdmissionResponseDto.from(
      await this.service.withdraw(id, expectedVersion, {
        ...(body.decisionNote !== undefined ? { decisionNote: body.decisionNote } : {}),
      }),
    );
  }

  @Get(':id/history')
  @RequirePermissions(AdmissionPermissions.READ)
  @ApiOperation({ summary: 'List state-transition history for this admission.' })
  @ApiOkResponse({ type: AdmissionHistoryListResponseDto })
  @ApiNotFoundResponse()
  public async history(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdmissionHistoryListResponseDto> {
    const items = await this.service.listHistory(id);
    return { items: items.map(AdmissionHistoryResponseDto.from) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(AdmissionPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a DRAFT/REJECTED/WITHDRAWN admission.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'not deletable in current status' })
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }
}

function toUpdate(body: UpdateAdmissionDto): Parameters<AdmissionService['update']>[2] {
  const out: Record<string, unknown> = {};
  const keys: (keyof UpdateAdmissionDto)[] = [
    'firstName',
    'lastName',
    'gender',
    'bloodGroup',
    'targetAcademicYearId',
    'targetClassId',
    'targetSectionId',
    'admissionNo',
    'rollNo',
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
    'religion',
    'category',
    'nationality',
    'motherTongue',
    'aadhaar',
    'apaarId',
    'isCwsn',
    'disabilityType',
    'isRte',
    'isMinority',
    'minorityCommunity',
    'isBpl',
    'previousSchoolName',
    'previousSchoolTcNo',
    'admissionType',
    'placeOfBirth',
    'birthCertNo',
  ];
  for (const k of keys) {
    if (body[k] !== undefined) {
      out[k] = body[k];
    }
  }
  if (body.dateOfBirth !== undefined) {
    out.dateOfBirth = new Date(body.dateOfBirth);
  }
  if (body.previousSchoolTcDate !== undefined) {
    out.previousSchoolTcDate =
      body.previousSchoolTcDate === null ? null : new Date(body.previousSchoolTcDate);
  }
  return out as Parameters<AdmissionService['update']>[2];
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
