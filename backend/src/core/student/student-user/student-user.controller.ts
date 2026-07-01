/**
 * StudentUserController — Sprint 18 W6.
 *
 * Admin-side endpoints for the student-portal lifecycle:
 *
 *   POST   /api/v1/students/:id/users                        invite a student
 *   POST   /api/v1/students/:id/users/:userId/resend-invite  resend invitation
 *   POST   /api/v1/students/:id/users/:userId/suspend        lifecycle FSM
 *   POST   /api/v1/students/:id/users/:userId/reactivate     lifecycle FSM
 *   POST   /api/v1/students/:id/users/:userId/archive        lifecycle FSM
 *   GET    /api/v1/students/:id/users                        list StudentUsers
 *
 * `:userId` is the `StudentUser.id` (NOT `User.id`). Mirrors
 * `ParentUserController` minus the family-slot semantics — Student is 1:1
 * with the underlying User, so list always returns 0 or 1 alive row.
 *
 * All endpoints are gated by the `student_portal` feature flag here in
 * the controller.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { NotFoundError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { StudentInvitationService } from '../invitation/student-invitation.service';
import { StudentFeatureFlags, StudentPermissions } from '../student.constants';
import { StudentPortalDisabledError } from '../student.errors';
import {
  InviteStudentUserDto,
  InviteStudentUserResponseDto,
  ResendStudentInviteDto,
  StudentLifecycleActionDto,
  StudentUserListResponseDto,
  StudentUserResponseDto,
} from './student-user.dto';
import { StudentUserService } from './student-user.service';

@ApiTags('Student Portal — Admin')
@ApiBearerAuth()
@Controller({ path: 'students', version: '1' })
export class StudentUserController {
  constructor(
    private readonly invitations: StudentInvitationService,
    private readonly studentUsers: StudentUserService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Post(':id/users')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(StudentPermissions.INVITE_USER)
  @ApiOperation({ summary: 'Invite a new student-portal user.' })
  @ApiCreatedResponse({ type: InviteStudentUserResponseDto })
  @ApiNotFoundResponse({ description: 'student not found' })
  @ApiUnprocessableEntityResponse({
    description: 'email already linked or user state forbids re-invite',
  })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async invite(
    @Param('id', new ParseUUIDPipe()) studentId: string,
    @Body() body: InviteStudentUserDto,
  ): Promise<InviteStudentUserResponseDto> {
    await this.assertPortalEnabled();
    const result = await this.invitations.invite({
      studentId,
      email: body.email,
      displayName: body.displayName,
      ...(body.locale !== undefined ? { locale: body.locale } : {}),
    });
    return {
      studentUser: StudentUserResponseDto.from(result.studentUser),
      userId: result.userId,
      inviteExpiresAt: result.inviteExpiresAt.toISOString(),
    };
  }

  @Post(':id/users/:userId/resend-invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.INVITE_USER)
  @ApiOperation({
    summary:
      'Resend an invitation to a PENDING_INVITE student user (bumps lastInviteAt, re-issues token).',
  })
  @ApiOkResponse({ type: InviteStudentUserResponseDto })
  @ApiNotFoundResponse({ description: 'student or student-user not found' })
  @ApiConflictResponse({ description: 'student-user is not PENDING_INVITE' })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async resendInvite(
    @Param('id', new ParseUUIDPipe()) studentId: string,
    @Param('userId', new ParseUUIDPipe()) studentUserId: string,
    @Body() body: ResendStudentInviteDto,
  ): Promise<InviteStudentUserResponseDto> {
    await this.assertPortalEnabled();
    const result = await this.invitations.resendInvite({
      studentId,
      studentUserId,
      expectedVersion: body.expectedVersion,
    });
    return {
      studentUser: StudentUserResponseDto.from(result.studentUser),
      userId: result.userId,
      inviteExpiresAt: result.inviteExpiresAt.toISOString(),
    };
  }

  @Post(':id/users/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.SUSPEND_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Suspend a student-portal user.' })
  @ApiOkResponse({ type: StudentUserResponseDto })
  @ApiNotFoundResponse({ description: 'student or student-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async suspend(
    @Param('id', new ParseUUIDPipe()) studentId: string,
    @Param('userId', new ParseUUIDPipe()) studentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: StudentLifecycleActionDto,
  ): Promise<StudentUserResponseDto> {
    await this.assertPortalEnabled();
    await this.assertBelongsToStudent(studentId, studentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.studentUsers.suspend({
      id: studentUserId,
      expectedVersion,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return StudentUserResponseDto.from(row);
  }

  @Post(':id/users/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.REACTIVATE_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reactivate a SUSPENDED student-portal user.' })
  @ApiOkResponse({ type: StudentUserResponseDto })
  @ApiNotFoundResponse({ description: 'student or student-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async reactivate(
    @Param('id', new ParseUUIDPipe()) studentId: string,
    @Param('userId', new ParseUUIDPipe()) studentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() _body: StudentLifecycleActionDto,
  ): Promise<StudentUserResponseDto> {
    void _body;
    await this.assertPortalEnabled();
    await this.assertBelongsToStudent(studentId, studentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.studentUsers.reactivate({ id: studentUserId, expectedVersion });
    return StudentUserResponseDto.from(row);
  }

  @Post(':id/users/:userId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(StudentPermissions.ARCHIVE_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Archive a student-portal user (terminal; cancels outstanding reset tokens).',
  })
  @ApiOkResponse({ type: StudentUserResponseDto })
  @ApiNotFoundResponse({ description: 'student or student-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async archive(
    @Param('id', new ParseUUIDPipe()) studentId: string,
    @Param('userId', new ParseUUIDPipe()) studentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: StudentLifecycleActionDto,
  ): Promise<StudentUserResponseDto> {
    await this.assertPortalEnabled();
    await this.assertBelongsToStudent(studentId, studentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.studentUsers.archive({
      id: studentUserId,
      expectedVersion,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return StudentUserResponseDto.from(row);
  }

  @Get(':id/users')
  @RequirePermissions(StudentPermissions.READ_USER)
  @ApiOperation({ summary: 'List student-portal users for the given student.' })
  @ApiOkResponse({ type: StudentUserListResponseDto })
  @ApiForbiddenResponse({ description: 'student_portal flag disabled' })
  public async list(
    @Param('id', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentUserListResponseDto> {
    await this.assertPortalEnabled();
    const items = await this.studentUsers.listForStudent(studentId);
    return {
      items: items.map(StudentUserResponseDto.from),
      nextCursor: null,
    };
  }

  // -----------------------------------------------------------------------
  // helpers
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

  /** Reject mismatched (student, student-user) URL combos. */
  private async assertBelongsToStudent(
    studentId: string,
    studentUserId: string,
  ): Promise<void> {
    const row = await this.studentUsers.getById(studentUserId);
    if (row.studentId !== studentId) {
      throw new NotFoundError('StudentUser', studentUserId);
    }
  }
}
