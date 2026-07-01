/**
 * SubscriptionController — super-admin lifecycle for a school's subscription.
 *
 * Routes mount under `/v1/super-admin/schools/:schoolId/subscription[*]`:
 *   GET    /                  — read the school's active subscription
 *   GET    /history           — read the history journal (cursor-paginated)
 *   POST   /assign            — assign a plan (cancels any prior active row)
 *   POST   /:id/activate      — PENDING/TRIAL/EXPIRED/SUSPENDED -> ACTIVE
 *   POST   /:id/upgrade       — switch to a higher plan
 *   POST   /:id/downgrade     — switch to a lower plan
 *   POST   /:id/renew         — extend expiryDate
 *   POST   /:id/suspend       — ACTIVE/EXPIRING/TRIAL -> SUSPENDED
 *   POST   /:id/reactivate    — SUSPENDED -> ACTIVE
 *   POST   /:id/cancel        — any non-terminal -> CANCELLED (terminal)
 *
 * Mutations require `If-Match` (numeric version) to enable optimistic
 * concurrency. The assign endpoint is exempt because no current row is
 * targeted (it creates a brand-new row).
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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { SubscriptionPermissions } from '../subscription.constants';
import { AllowWhenInactive } from '../guard/allow-when-inactive.decorator';
import {
  AssignSubscriptionDto,
  CancelSubscriptionDto,
  ChangePlanDto,
  RenewSubscriptionDto,
  SubscriptionHistoryListResponseDto,
  SubscriptionHistoryResponseDto,
  SubscriptionListResponseDto,
  SubscriptionResponseDto,
  SuspendSubscriptionDto,
} from './subscription.dto';
import { SubscriptionHistoryRepository } from './subscription-history.repository';
import { SubscriptionService } from './subscription.service';

const DEFAULT_HISTORY_PAGE = 50;
const MAX_HISTORY_PAGE = 200;

@ApiTags('SuperAdmin · Subscription')
@ApiBearerAuth()
@AllowWhenInactive()
@Controller({
  path: 'super-admin/schools/:schoolId/subscription',
  version: '1',
})
export class SubscriptionController {
  constructor(
    private readonly service: SubscriptionService,
    private readonly history: SubscriptionHistoryRepository,
  ) {}

  @Get()
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_READ)
  @ApiOperation({ summary: 'Read the active subscription for a school.' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async getActive(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(await this.service.getActive(schoolId));
  }

  @Get('all')
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_READ)
  @ApiOperation({ summary: 'List every subscription row (active + historical) for a school.' })
  @ApiOkResponse({ type: SubscriptionListResponseDto })
  public async listAll(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<SubscriptionListResponseDto> {
    const rows = await this.service.listForSchool(schoolId);
    return { items: rows.map(SubscriptionResponseDto.from) };
  }

  @Get('history')
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_HISTORY_READ)
  @ApiOperation({ summary: 'Read the subscription history journal.' })
  @ApiOkResponse({ type: SubscriptionHistoryListResponseDto })
  public async listHistory(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Query('subscriptionId') subscriptionId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<SubscriptionHistoryListResponseDto> {
    const parsedLimit = Math.min(
      MAX_HISTORY_PAGE,
      Math.max(1, Number.parseInt(limit ?? '', 10) || DEFAULT_HISTORY_PAGE),
    );
    const { rows, nextCursorId } = await this.history.list({
      schoolId,
      ...(subscriptionId !== undefined ? { subscriptionId } : {}),
      limit: parsedLimit,
      ...(cursor !== undefined ? { cursorId: cursor } : {}),
    });
    return {
      items: rows.map(SubscriptionHistoryResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_ASSIGN)
  @ApiOperation({ summary: 'Assign a plan to a school (creates new PENDING/TRIAL subscription).' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async assign(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Body() body: AssignSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.assign({
        schoolId,
        planId: body.planId,
        billingCycle: body.billingCycle,
        ...(body.trialDays !== undefined ? { trialDays: body.trialDays } : {}),
        ...(body.autoRenew !== undefined ? { autoRenew: body.autoRenew } : {}),
      }),
    );
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Activate a pending/trial subscription.' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async activate(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.activate(schoolId, id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/upgrade')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_UPGRADE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Upgrade subscription to a higher plan (new ACTIVE row).' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async upgrade(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ChangePlanDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.upgrade({
        schoolId,
        subscriptionId: id,
        expectedVersion: parseIfMatch(ifMatch),
        newPlanId: body.newPlanId,
        ...(body.billingCycle !== undefined ? { billingCycle: body.billingCycle } : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      }),
    );
  }

  @Post(':id/downgrade')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_DOWNGRADE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Downgrade subscription to a lower plan (new ACTIVE row).' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async downgrade(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ChangePlanDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.downgrade({
        schoolId,
        subscriptionId: id,
        expectedVersion: parseIfMatch(ifMatch),
        newPlanId: body.newPlanId,
        ...(body.billingCycle !== undefined ? { billingCycle: body.billingCycle } : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      }),
    );
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_RENEW)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Renew an active subscription (extends expiryDate).' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async renew(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RenewSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.renew({
        schoolId,
        subscriptionId: id,
        expectedVersion: parseIfMatch(ifMatch),
        extendDays: body.extendDays,
        ...(body.billingCycle !== undefined ? { billingCycle: body.billingCycle } : {}),
      }),
    );
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_SUSPEND)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Suspend an active subscription.' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async suspend(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SuspendSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.suspend(schoolId, id, parseIfMatch(ifMatch), body.reason),
    );
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_REACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Reactivate a suspended subscription.' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async reactivate(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.reactivate(schoolId, id, parseIfMatch(ifMatch)),
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SubscriptionPermissions.SUBSCRIPTION_CANCEL)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Cancel a subscription (terminal, CANCELLED).' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  public async cancel(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.service.cancel(schoolId, id, parseIfMatch(ifMatch), body.reason),
    );
  }
}
