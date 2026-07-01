/**
 * StudentController — HTTP routes for `/api/v1/students`. Mounted via the
 * global prefix + URI versioning. Authenticated by the global
 * `JwtAuthGuard`; each handler declares its required permission via
 * `@RequirePermissions`.
 *
 * `POST /students` is left as a public endpoint per
 * `REST_API_DESIGN.md:548`; the canonical creation path in Sprint 3 is
 * via Admission approval, but admins can still create directly when a
 * school imports legacy rosters.
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
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { AcademicYearRepository } from '../../academic/repositories/academic-year.repository';
import { ClassRepository } from '../../academic/repositories/class.repository';
import { SectionRepository } from '../../academic/repositories/section.repository';
import { NotFoundError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT, PaginationQueryDto } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { StudentFeatureFlags, StudentPermissions } from '../student.constants';
import {
  NotAStudentUserError,
  StudentPortalDisabledError,
  StudentUserNotActiveError,
} from '../student.errors';
import { STUDENT_STATUS_VALUES, type StudentStatusValue } from '../student.types';
import { StudentUserService } from '../student-user/student-user.service';
import {
  AssignRollDto,
  CreateStudentDto,
  StudentListResponseDto,
  StudentResponseDto,
  UpdateStudentDto,
} from './student.dto';
import { StudentService } from './student.service';

class StudentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(STUDENT_STATUS_VALUES as unknown as object)
  public readonly status?: StudentStatusValue;

  @IsOptional()
  @IsUUID()
  public readonly academicYearId?: string;

  @IsOptional()
  @IsUUID()
  public readonly classId?: string;

  @IsOptional()
  @IsUUID()
  public readonly sectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly q?: string;
}

export class StudentMeAcademicYearDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ format: 'date-time' }) public readonly startDate!: string;
  @ApiProperty({ format: 'date-time' }) public readonly endDate!: string;
  @ApiProperty() public readonly isCurrent!: boolean;
}

export class StudentMeClassDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly gradeLevel!: number;
  @ApiProperty() public readonly displayOrder!: number;
}

export class StudentMeSectionDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly classId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty({ nullable: true }) public readonly capacity!: number | null;
  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly classTeacherId!: string | null;
}

@ApiTags('Students')
@ApiBearerAuth()
@Controller({ path: 'students', version: '1' })
export class StudentController {
  constructor(
    private readonly service: StudentService,
    private readonly studentUsers: StudentUserService,
    private readonly featureFlags: FeatureFlagService,
    private readonly years: AcademicYearRepository,
    private readonly classes: ClassRepository,
    private readonly sections: SectionRepository,
  ) {}

  @Get()
  @RequirePermissions(StudentPermissions.READ)
  @ApiOperation({ summary: 'List students with filters and cursor pagination.' })
  @ApiQuery({ name: 'status', required: false, enum: STUDENT_STATUS_VALUES as unknown as string[] })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: StudentListResponseDto })
  public async list(@Query() query: StudentListQueryDto): Promise<StudentListResponseDto> {
    const limit = query.limit ?? PAGINATION_DEFAULT_LIMIT;
    const result = await this.service.list({
      limit,
      ...(query.cursor !== undefined ? { cursorId: decodeCursor(query.cursor) } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      ...(query.classId !== undefined ? { classId: query.classId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
    });
    return {
      items: result.items.map(StudentResponseDto.from),
      nextCursor: result.nextCursorId === null ? null : encodeCursor(result.nextCursorId),
    };
  }

  @Post()
  @RequirePermissions(StudentPermissions.CREATE)
  @ApiOperation({ summary: 'Create a student (canonical path is admission approval).' })
  @ApiCreatedResponse({ type: StudentResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'invalid placement or roll-number clash' })
  @ApiConflictResponse({ description: 'duplicate admission number' })
  public async create(@Body() body: CreateStudentDto): Promise<StudentResponseDto> {
    return StudentResponseDto.from(
      await this.service.create({
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: new Date(body.dateOfBirth),
        gender: body.gender,
        ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
        admissionNo: body.admissionNo,
        ...(body.rollNo !== undefined ? { rollNo: body.rollNo } : {}),
        academicYearId: body.academicYearId,
        classId: body.classId,
        sectionId: body.sectionId,
        admittedOn: new Date(body.admittedOn),
        ...(body.status !== undefined ? { status: body.status } : {}),
        emergencyContacts: body.emergencyContacts,
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
          ? { previousSchoolTcDate: new Date(body.previousSchoolTcDate) }
          : {}),
        ...(body.admissionType !== undefined ? { admissionType: body.admissionType } : {}),
        ...(body.placeOfBirth !== undefined ? { placeOfBirth: body.placeOfBirth } : {}),
        ...(body.birthCertNo !== undefined ? { birthCertNo: body.birthCertNo } : {}),
      }),
    );
  }

  // -----------------------------------------------------------------------
  // /me/* — student-portal self-service surface. Declared BEFORE the `:id`
  // routes so the literal `me` segment matches first; the ParseUUIDPipe on
  // the `:id` routes would otherwise reject the request with 400.
  // -----------------------------------------------------------------------

  @Get('me/profile')
  @RequirePermissions(StudentPermissions.READ_SELF)
  @ApiOperation({ summary: "Get the calling student's full profile." })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiForbiddenResponse({
    description: 'Not a student user, suspended/archived, or student_portal disabled.',
  })
  public async getMeProfile(): Promise<StudentResponseDto> {
    await this.assertPortalEnabled();
    const studentUser = await this.requireActiveStudentUser();
    return StudentResponseDto.from(await this.service.getById(studentUser.studentId));
  }

  @Get('me/academic-year')
  @RequirePermissions(StudentPermissions.READ_SELF)
  @ApiOperation({ summary: "Get the academic year for the calling student's placement." })
  @ApiOkResponse({ type: StudentMeAcademicYearDto })
  @ApiForbiddenResponse({
    description: 'Not a student user, suspended/archived, or student_portal disabled.',
  })
  public async getMeAcademicYear(): Promise<StudentMeAcademicYearDto> {
    await this.assertPortalEnabled();
    const studentUser = await this.requireActiveStudentUser();
    const student = await this.service.getById(studentUser.studentId);
    const year = await this.years.findById(student.academicYearId);
    if (year === null) {
      throw new NotFoundError('AcademicYear', student.academicYearId);
    }
    return {
      id: year.id,
      name: year.name,
      startDate: year.startDate.toISOString(),
      endDate: year.endDate.toISOString(),
      isCurrent: year.isCurrent,
    };
  }

  @Get('me/class')
  @RequirePermissions(StudentPermissions.READ_SELF)
  @ApiOperation({ summary: "Get the class for the calling student's placement." })
  @ApiOkResponse({ type: StudentMeClassDto })
  @ApiForbiddenResponse({
    description: 'Not a student user, suspended/archived, or student_portal disabled.',
  })
  public async getMeClass(): Promise<StudentMeClassDto> {
    await this.assertPortalEnabled();
    const studentUser = await this.requireActiveStudentUser();
    const student = await this.service.getById(studentUser.studentId);
    const klass = await this.classes.findById(student.classId);
    if (klass === null) {
      throw new NotFoundError('Class', student.classId);
    }
    return {
      id: klass.id,
      name: klass.name,
      gradeLevel: klass.gradeLevel,
      displayOrder: klass.displayOrder,
    };
  }

  @Get('me/section')
  @RequirePermissions(StudentPermissions.READ_SELF)
  @ApiOperation({ summary: "Get the section for the calling student's placement." })
  @ApiOkResponse({ type: StudentMeSectionDto })
  @ApiForbiddenResponse({
    description: 'Not a student user, suspended/archived, or student_portal disabled.',
  })
  public async getMeSection(): Promise<StudentMeSectionDto> {
    await this.assertPortalEnabled();
    const studentUser = await this.requireActiveStudentUser();
    const student = await this.service.getById(studentUser.studentId);
    const section = await this.sections.findById(student.sectionId);
    if (section === null) {
      throw new NotFoundError('Section', student.sectionId);
    }
    return {
      id: section.id,
      classId: section.classId,
      name: section.name,
      capacity: section.capacity,
      classTeacherId: section.classTeacherId,
    };
  }

  @Get(':id')
  @RequirePermissions(StudentPermissions.READ)
  @ApiOperation({ summary: 'Get a single student.' })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse()
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<StudentResponseDto> {
    return StudentResponseDto.from(await this.service.getById(id));
  }

  @Patch(':id')
  @RequirePermissions(StudentPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true, description: 'Current row version, e.g. "3".' })
  @ApiOperation({ summary: 'Update a student.' })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse()
  @ApiConflictResponse({ description: 'version conflict' })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StudentResponseDto.from(
      await this.service.update(id, expectedVersion, {
        ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
        ...(body.dateOfBirth !== undefined
          ? { dateOfBirth: new Date(body.dateOfBirth) }
          : {}),
        ...(body.gender !== undefined ? { gender: body.gender } : {}),
        ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
        ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl } : {}),
        ...(body.academicYearId !== undefined
          ? { academicYearId: body.academicYearId }
          : {}),
        ...(body.classId !== undefined ? { classId: body.classId } : {}),
        ...(body.sectionId !== undefined ? { sectionId: body.sectionId } : {}),
        ...(body.emergencyContacts !== undefined
          ? { emergencyContacts: body.emergencyContacts }
          : {}),
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
          ? { previousSchoolTcDate: new Date(body.previousSchoolTcDate) }
          : {}),
        ...(body.admissionType !== undefined ? { admissionType: body.admissionType } : {}),
        ...(body.placeOfBirth !== undefined ? { placeOfBirth: body.placeOfBirth } : {}),
        ...(body.birthCertNo !== undefined ? { birthCertNo: body.birthCertNo } : {}),
      }),
    );
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.DEACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Mark student INACTIVE.' })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or invalid state' })
  public async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StudentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StudentResponseDto.from(await this.service.deactivate(id, expectedVersion));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.REACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Restore an INACTIVE student to ACTIVE.' })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'version conflict or invalid state' })
  public async reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StudentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return StudentResponseDto.from(await this.service.reactivate(id, expectedVersion));
  }

  @Post(':id/assign-roll')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.ASSIGN_ROLL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Assign or clear the roll number for a student.' })
  @ApiOkResponse({ type: StudentResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'duplicate roll number in this section/year' })
  public async assignRoll(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AssignRollDto,
  ): Promise<StudentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const rollNo =
      body.rollNo === undefined || body.rollNo === '' ? null : (body.rollNo ?? null);
    return StudentResponseDto.from(
      await this.service.assignRoll(id, expectedVersion, rollNo),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(StudentPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete a student.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }

  // -----------------------------------------------------------------------
  // helpers (student-portal /me/* gating)
  // -----------------------------------------------------------------------

  private async assertPortalEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      StudentFeatureFlags.STUDENT_PORTAL,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new StudentPortalDisabledError();
    }
  }

  /**
   * Resolve the calling user → alive StudentUser row and assert it is ACTIVE.
   * Non-students get 403 NOT_A_STUDENT_USER, suspended/archived students get
   * 403 ACCOUNT_SUSPENDED / ACCOUNT_ARCHIVED / ACCOUNT_PENDING_INVITE.
   */
  private async requireActiveStudentUser() {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new NotAStudentUserError();
    }
    const row = await this.studentUsers.findAliveByUserId(ctx.userId);
    if (row === null) {
      throw new NotAStudentUserError();
    }
    if (row.status !== 'ACTIVE') {
      throw new StudentUserNotActiveError(row.status);
    }
    return row;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}
