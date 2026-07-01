/**
 * Notifications domain errors. All extend the shared `DomainError` hierarchy,
 * so the global filter maps them to the canonical envelope via `ERROR_CODES`.
 *
 * Note: `VersionConflict` (optimistic-locking) and module-disabled errors
 * are reused from `core/errors` / module-level guards; they are NOT
 * redefined here. The FeatureFlag service throws its own ModuleDisabled
 * variant when `module.notifications` is off.
 */
import { ERROR_CODES } from '../../contracts/api';
import { ConflictError, DomainError, NotFoundError } from '../errors/domain-error';

import type {
  NotificationCategoryValue,
  NotificationChannelValue,
} from './notifications.constants';

// ---------------------------------------------------------------------------
// NotFound
// ---------------------------------------------------------------------------
export class NotificationTemplateNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('NotificationTemplate', id);
  }
}

export class NotificationMessageNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('NotificationMessage', id);
  }
}

export class NotificationCampaignNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('NotificationCampaign', id);
  }
}

export class NotificationEventUnknownError extends NotFoundError {
  constructor(eventKey: string) {
    super('NotificationEvent', eventKey);
  }
}

// ---------------------------------------------------------------------------
// Conflict (duplicate code — STORED deleted_at_key partial unique)
// ---------------------------------------------------------------------------
export class DuplicateNotificationTemplateCodeError extends ConflictError {
  constructor(code: string) {
    super(`A notification template with this code already exists for the channel.`, {
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: { resource: 'NotificationTemplate', conflictField: 'code', value: code },
    });
  }
}

// ---------------------------------------------------------------------------
// Module / feature flag
// ---------------------------------------------------------------------------
export class NotificationsModuleDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Notifications module is disabled for this tenant.',
      details: { reason: 'FEATURE_DISABLED', flag: 'module.notifications' },
    });
  }
}

export class NotificationBroadcastDisabledError extends DomainError {
  constructor() {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'Broadcast dispatch is disabled. Enable the notifications.allow_broadcast feature flag.',
      details: { flag: 'notifications.allow_broadcast' },
    });
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export class NotificationTemplateInactiveError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Notification template is inactive and cannot be dispatched.',
      details: { reason: 'TEMPLATE_INACTIVE', id },
    });
  }
}

export class NotificationTemplateInUseError extends DomainError {
  constructor(id: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message:
        'Cannot delete template because it is referenced by active campaigns or queued messages.',
      details: { reason: 'TEMPLATE_IN_USE', id },
    });
  }
}

export class NotificationMessageNotCancellableError extends DomainError {
  constructor(id: string, status: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Notification message can only be cancelled while in QUEUED status.',
      details: { reason: 'MESSAGE_NOT_CANCELLABLE', id, status },
    });
  }
}

export class NotificationCampaignNotStartableError extends DomainError {
  constructor(id: string, status: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Notification campaign can only be started while in DRAFT status.',
      details: { reason: 'CAMPAIGN_NOT_STARTABLE', id, status },
    });
  }
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------
export interface CommunicationChannelDisabledOptions {
  readonly channel: NotificationChannelValue;
  readonly reason: string;
}

export class CommunicationChannelDisabledError extends DomainError {
  constructor(options: CommunicationChannelDisabledOptions) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Communication channel "${options.channel}" is disabled: ${options.reason}.`,
      details: {
        reason: 'CHANNEL_DISABLED',
        channel: options.channel,
        gate: options.reason,
      },
    });
  }
}

export class CommunicationChannelNotImplementedError extends DomainError {
  constructor(providerCode: string) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Communication provider "${providerCode}" is not implemented in this sprint.`,
      details: { reason: 'PROVIDER_NOT_IMPLEMENTED', providerCode },
    });
  }
}

export interface CommunicationQuotaExceededOptions {
  readonly channel: NotificationChannelValue;
  readonly limit: number;
  readonly used: number;
}

export class CommunicationQuotaExceededError extends DomainError {
  constructor(options: CommunicationQuotaExceededOptions) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: `Communication quota exceeded for channel "${options.channel}".`,
      details: {
        reason: 'QUOTA_EXCEEDED',
        channel: options.channel,
        limit: options.limit,
        used: options.used,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Recipient
// ---------------------------------------------------------------------------
export interface RecipientOptedOutOptions {
  readonly recipientUserId: string;
  readonly channel: NotificationChannelValue;
  readonly category: NotificationCategoryValue;
}

export class RecipientOptedOutError extends DomainError {
  constructor(options: RecipientOptedOutOptions) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Recipient has opted out of this channel for this category.',
      details: {
        reason: 'RECIPIENT_OPTED_OUT',
        recipientUserId: options.recipientUserId,
        channel: options.channel,
        category: options.category,
      },
    });
  }
}

export interface RecipientQuietHoursOptions {
  readonly recipientUserId: string;
  readonly until: Date;
}

export class RecipientQuietHoursError extends DomainError {
  constructor(options: RecipientQuietHoursOptions) {
    super({
      code: ERROR_CODES.STATE_INVALID,
      message: 'Recipient is currently in quiet-hours window.',
      details: {
        reason: 'RECIPIENT_QUIET_HOURS',
        recipientUserId: options.recipientUserId,
        until: options.until.toISOString(),
      },
    });
  }
}
