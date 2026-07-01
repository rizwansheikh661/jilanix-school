/**
 * ParentUserController — Sprint 17 W7.
 *
 * Admin-side endpoints for the parent-portal lifecycle:
 *
 *   POST   /api/v1/parents/:id/users                       invite a parent
 *   POST   /api/v1/parents/:id/users/:userId/resend-invite resend invitation
 *   POST   /api/v1/parents/:id/users/:userId/suspend       lifecycle FSM
 *   POST   /api/v1/parents/:id/users/:userId/reactivate    lifecycle FSM
 *   POST   /api/v1/parents/:id/users/:userId/archive       lifecycle FSM
 *   GET    /api/v1/parents/:id/users                       list ParentUsers
 *
 * `:userId` in the URL is the `ParentUser.id` (not `User.id`) — the lifecycle
 * is bound to the junction row, not the underlying identity.
 *
 * All endpoints are gated by the `parent_portal` feature flag here in the
 * controller. The wrapping service errors stay narrow (NotFound / FSM /
 * VersionConflict) so the global filter renders them correctly.
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
import { ParentInvitationService } from '../invitation/parent-invitation.service';
import { ParentFeatureFlags, ParentPermissions } from '../parent.constants';
import { ParentPortalDisabledError } from '../parent.errors';
import {
  InviteParentUserDto,
  InviteParentUserResponseDto,
  LifecycleActionDto,
  ParentUserListResponseDto,
  ParentUserResponseDto,
  ResendInviteDto,
} from './parent-user.dto';
import { ParentUserService } from './parent-user.service';

@ApiTags('Parent Portal — Admin')
@ApiBearerAuth()
@Controller({ path: 'parents', version: '1' })
export class ParentUserController {
  constructor(
    private readonly invitations: ParentInvitationService,
    private readonly parentUsers: ParentUserService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Post(':id/users')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(ParentPermissions.INVITE_USER)
  @ApiOperation({ summary: 'Invite a new parent-portal user.' })
  @ApiCreatedResponse({ type: InviteParentUserResponseDto })
  @ApiNotFoundResponse({ description: 'parent not found' })
  @ApiUnprocessableEntityResponse({
    description: 'email already linked or user state forbids re-invite',
  })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async invite(
    @Param('id', new ParseUUIDPipe()) parentId: string,
    @Body() body: InviteParentUserDto,
  ): Promise<InviteParentUserResponseDto> {
    await this.assertPortalEnabled();
    const result = await this.invitations.invite({
      parentId,
      email: body.email,
      displayName: body.displayName,
      relation: body.relation,
      ...(body.locale !== undefined ? { locale: body.locale } : {}),
    });
    return {
      parentUser: ParentUserResponseDto.from(result.parentUser),
      userId: result.userId,
      inviteExpiresAt: result.inviteExpiresAt.toISOString(),
    };
  }

  @Post(':id/users/:userId/resend-invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ParentPermissions.INVITE_USER)
  @ApiOperation({
    summary:
      'Resend an invitation to a PENDING_INVITE parent user (bumps lastInviteAt, re-issues token).',
  })
  @ApiOkResponse({ type: InviteParentUserResponseDto })
  @ApiNotFoundResponse({ description: 'parent or parent-user not found' })
  @ApiConflictResponse({ description: 'parent-user is not PENDING_INVITE' })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async resendInvite(
    @Param('id', new ParseUUIDPipe()) parentId: string,
    @Param('userId', new ParseUUIDPipe()) parentUserId: string,
    @Body() body: ResendInviteDto,
  ): Promise<InviteParentUserResponseDto> {
    await this.assertPortalEnabled();
    const result = await this.invitations.resendInvite({
      parentId,
      parentUserId,
      expectedVersion: body.expectedVersion,
    });
    return {
      parentUser: ParentUserResponseDto.from(result.parentUser),
      userId: result.userId,
      inviteExpiresAt: result.inviteExpiresAt.toISOString(),
    };
  }

  @Post(':id/users/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ParentPermissions.SUSPEND_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Suspend a parent-portal user.' })
  @ApiOkResponse({ type: ParentUserResponseDto })
  @ApiNotFoundResponse({ description: 'parent or parent-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async suspend(
    @Param('id', new ParseUUIDPipe()) parentId: string,
    @Param('userId', new ParseUUIDPipe()) parentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LifecycleActionDto,
  ): Promise<ParentUserResponseDto> {
    await this.assertPortalEnabled();
    await this.assertBelongsToParent(parentId, parentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.parentUsers.suspend({
      id: parentUserId,
      expectedVersion,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return ParentUserResponseDto.from(row);
  }

  @Post(':id/users/:userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ParentPermissions.REACTIVATE_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reactivate a SUSPENDED parent-portal user.' })
  @ApiOkResponse({ type: ParentUserResponseDto })
  @ApiNotFoundResponse({ description: 'parent or parent-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async reactivate(
    @Param('id', new ParseUUIDPipe()) parentId: string,
    @Param('userId', new ParseUUIDPipe()) parentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() _body: LifecycleActionDto,
  ): Promise<ParentUserResponseDto> {
    void _body;
    await this.assertPortalEnabled();
    await this.assertBelongsToParent(parentId, parentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.parentUsers.reactivate({ id: parentUserId, expectedVersion });
    return ParentUserResponseDto.from(row);
  }

  @Post(':id/users/:userId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(ParentPermissions.ARCHIVE_USER)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({
    summary: 'Archive a parent-portal user (terminal; cancels outstanding reset tokens).',
  })
  @ApiOkResponse({ type: ParentUserResponseDto })
  @ApiNotFoundResponse({ description: 'parent or parent-user not found' })
  @ApiConflictResponse({ description: 'illegal state transition' })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async archive(
    @Param('id', new ParseUUIDPipe()) parentId: string,
    @Param('userId', new ParseUUIDPipe()) parentUserId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LifecycleActionDto,
  ): Promise<ParentUserResponseDto> {
    await this.assertPortalEnabled();
    await this.assertBelongsToParent(parentId, parentUserId);
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.parentUsers.archive({
      id: parentUserId,
      expectedVersion,
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return ParentUserResponseDto.from(row);
  }

  @Get(':id/users')
  @RequirePermissions(ParentPermissions.READ_USER)
  @ApiOperation({ summary: 'List parent-portal users for the given parent.' })
  @ApiOkResponse({ type: ParentUserListResponseDto })
  @ApiForbiddenResponse({ description: 'parent_portal flag disabled' })
  public async list(
    @Param('id', new ParseUUIDPipe()) parentId: string,
  ): Promise<ParentUserListResponseDto> {
    await this.assertPortalEnabled();
    const items = await this.parentUsers.listForParent(parentId);
    return {
      items: items.map(ParentUserResponseDto.from),
      nextCursor: null,
    };
  }

  // -----------------------------------------------------------------------
  // helpers
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

  /** Reject mismatched (parent, parent-user) URL combos. */
  private async assertBelongsToParent(
    parentId: string,
    parentUserId: string,
  ): Promise<void> {
    const row = await this.parentUsers.getById(parentUserId);
    if (row.parentId !== parentId) {
      throw new NotFoundError('ParentUser', parentUserId);
    }
  }
}
