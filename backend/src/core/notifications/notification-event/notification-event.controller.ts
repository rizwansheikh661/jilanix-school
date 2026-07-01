/**
 * NotificationEventController — `/api/v1/notifications/events` routes
 * (Sprint 10 Wave 11). Read-only catalog plus a super-admin test-fire
 * endpoint for dry-running an event against a real recipient.
 *
 * The dispatcher itself gates `module.notifications`; the test-fire
 * endpoint additionally requires super-admin (`actorScope === 'global'`)
 * because firing real notifications outside a domain-event flow is an
 * operator action.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ForbiddenError } from '../../errors/domain-error';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { NotificationEventDispatcherService } from '../notification-event-dispatcher/notification-event-dispatcher.service';
import { NotificationEventRegistry } from '../notification-event.registry';
import {
  NotificationsFeatureFlags,
  NotificationsPermissions,
} from '../notifications.constants';
import { NotificationsModuleDisabledError } from '../notifications.errors';
import {
  EventCatalogItemDto,
  TestFireEventDto,
  TestFireEventResponseDto,
} from './notification-event.dto';

@ApiTags('Notification Events')
@ApiBearerAuth()
@Controller('api/v1/notifications/events')
export class NotificationEventController {
  constructor(
    private readonly registry: NotificationEventRegistry,
    private readonly dispatcher: NotificationEventDispatcherService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.EVENT_READ)
  @ApiOperation({
    summary:
      'List every registered notification event (key, category, priority, audience, description, sampleVariables).',
  })
  @ApiOkResponse({ type: [EventCatalogItemDto] })
  public list(): EventCatalogItemDto[] {
    return this.registry.getAll().map((def) => ({
      key: def.key,
      category: def.category,
      defaultPriority: def.defaultPriority,
      audience: def.audience,
      description: def.description,
      sampleVariables: def.sampleVariables,
    }));
  }

  @Post(':key/test-fire')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(NotificationsPermissions.EVENT_TEST_FIRE)
  @ApiOperation({
    summary:
      'Super-admin: test-fire a registered event with a sample payload (flag-gated on module.notifications).',
  })
  @ApiParam({ name: 'key', description: 'Event key (uppercase + underscores).' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Recommended. Enforced by the global Idempotency-Key middleware.',
  })
  @ApiCreatedResponse({ type: TestFireEventResponseDto })
  @ApiNotFoundResponse()
  public async testFire(
    @Param('key') key: string,
    @Body() body: TestFireEventDto,
    @Headers('idempotency-key') _idempotencyKey: string | undefined,
  ): Promise<TestFireEventResponseDto> {
    const ctx = RequestContextRegistry.require();
    if (ctx.actorScope !== 'global') {
      throw new ForbiddenError('Super-admin scope required for this operation.', {
        reason: 'PLATFORM_SCOPE_REQUIRED',
      });
    }
    const schoolId = ctx.schoolId;
    if (schoolId === undefined) {
      throw new ForbiddenError('Test-fire requires a target school scope.', {
        reason: 'SCHOOL_SCOPE_REQUIRED',
      });
    }

    const enabled = await this.featureFlags.isEnabled(
      NotificationsFeatureFlags.MODULE,
      { schoolId },
    );
    if (!enabled) {
      throw new NotificationsModuleDisabledError();
    }

    // Will throw NotificationEventUnknownError (-> 404) if key is bogus.
    const definition = this.registry.get(key);

    const result = await this.dispatcher.dispatch({
      eventKey: definition.key,
      schoolId,
      recipients: [
        {
          userId: body.recipientUserId,
          audience: definition.audience,
        },
      ],
      variables: body.variables ?? {},
      ...(body.aggregateType !== undefined ? { aggregateType: body.aggregateType } : {}),
      ...(body.aggregateId !== undefined ? { aggregateId: body.aggregateId } : {}),
    });

    return {
      created: result.created.length,
      skipped: result.skipped.length,
    };
  }
}
