/**
 * Notifications module constants — permission keys, feature flag keys,
 * outbox topics, shared enum value tuples, and numeric/format guardrails.
 *
 * Sprint 10 ships the Notifications & Communication foundation:
 *   - Templates (Email/SMS/WhatsApp/In-App) + versions.
 *   - In-app notification center (bell, feed, mark-read, unread count).
 *   - Per-user channel + category preferences with quiet-hours.
 *   - Channel abstraction (port + registry + 5 stub adapters + in-app real).
 *   - Code-side event catalog + dispatcher.
 *   - Queue + dispatcher reusing Sprint 5 Outbox + Jobs + DLQ.
 *   - Broadcast campaigns (SCHOOL/BRANCH/CLASS/SECTION targets).
 *   - Per-school communication entitlements + monthly usage counters.
 *
 * Real provider integration is OUT — adapters throw NotImplemented; only
 * the in-app adapter is functional this sprint.
 */

// ---------------------------------------------------------------------------
// Permissions — 28 keys.
// ---------------------------------------------------------------------------
export const NotificationsPermissions = {
  // Template
  TEMPLATE_READ: 'notification-template.read',
  TEMPLATE_CREATE: 'notification-template.create',
  TEMPLATE_UPDATE: 'notification-template.update',
  TEMPLATE_DELETE: 'notification-template.delete',
  TEMPLATE_ACTIVATE: 'notification-template.activate',
  TEMPLATE_DEACTIVATE: 'notification-template.deactivate',
  TEMPLATE_CREATE_VERSION: 'notification-template.create-version',
  // Message
  MESSAGE_READ: 'notification-message.read',
  MESSAGE_CANCEL: 'notification-message.cancel',
  MESSAGE_SEND_TEST: 'notification-message.send-test',
  // Inbox (self)
  INBOX_READ: 'notification-inbox.read',
  INBOX_MARK_READ: 'notification-inbox.mark-read',
  // Preference (self)
  PREFERENCE_READ: 'notification-preference.read',
  PREFERENCE_UPDATE: 'notification-preference.update',
  // Campaign
  CAMPAIGN_READ: 'notification-campaign.read',
  CAMPAIGN_CREATE: 'notification-campaign.create',
  CAMPAIGN_START: 'notification-campaign.start',
  CAMPAIGN_CANCEL: 'notification-campaign.cancel',
  // Entitlement (tenant read)
  ENTITLEMENT_READ: 'communication-entitlement.read',
  // Entitlement (super-admin)
  ENTITLEMENT_ADMIN_READ: 'communication-entitlement.admin.read',
  ENTITLEMENT_ADMIN_UPDATE: 'communication-entitlement.admin.update',
  ENTITLEMENT_ADMIN_RESET_USAGE: 'communication-entitlement.admin.reset-usage',
  // Usage
  USAGE_READ: 'communication-usage.read',
  USAGE_ADMIN_READ: 'communication-usage.admin.read',
  // Provider catalog
  PROVIDER_ADMIN_READ: 'communication-provider.admin.read',
  // Event catalog
  EVENT_READ: 'notification-event.read',
  EVENT_TEST_FIRE: 'notification-event.test-fire',
} as const;

export type NotificationsPermission =
  (typeof NotificationsPermissions)[keyof typeof NotificationsPermissions];

export const NOTIFICATIONS_PERMISSION_DESCRIPTIONS: Readonly<
  Record<NotificationsPermission, string>
> = Object.freeze({
  [NotificationsPermissions.TEMPLATE_READ]:
    'List or read notification templates (header + active version).',
  [NotificationsPermissions.TEMPLATE_CREATE]:
    'Create a notification template header with its initial version.',
  [NotificationsPermissions.TEMPLATE_UPDATE]:
    'Update header-only fields on a template (name, category, active flag).',
  [NotificationsPermissions.TEMPLATE_DELETE]:
    'Soft-delete a template; refused if referenced by active campaigns or queued messages.',
  [NotificationsPermissions.TEMPLATE_ACTIVATE]:
    'Activate a template (isActive = true) so the dispatcher can pick it up.',
  [NotificationsPermissions.TEMPLATE_DEACTIVATE]:
    'Deactivate a template (isActive = false); stops new dispatches.',
  [NotificationsPermissions.TEMPLATE_CREATE_VERSION]:
    'Append a new immutable version and bump the active version pointer.',
  [NotificationsPermissions.MESSAGE_READ]:
    'List or read notification messages with their event log.',
  [NotificationsPermissions.MESSAGE_CANCEL]:
    'Cancel a QUEUED message; refused once SENDING/SENT/DELIVERED.',
  [NotificationsPermissions.MESSAGE_SEND_TEST]:
    'Render a template against an ad-hoc payload and enqueue a single test message.',
  [NotificationsPermissions.INBOX_READ]:
    'Read the current user\u2019s in-app inbox feed and unread counter.',
  [NotificationsPermissions.INBOX_MARK_READ]:
    'Mark one or all of the current user\u2019s in-app messages as read.',
  [NotificationsPermissions.PREFERENCE_READ]:
    'Read the current user\u2019s notification preferences (channels, categories, quiet-hours).',
  [NotificationsPermissions.PREFERENCE_UPDATE]:
    'Update the current user\u2019s notification preferences.',
  [NotificationsPermissions.CAMPAIGN_READ]:
    'List or read broadcast campaigns with recipient summary counts.',
  [NotificationsPermissions.CAMPAIGN_CREATE]:
    'Create a DRAFT broadcast campaign envelope.',
  [NotificationsPermissions.CAMPAIGN_START]:
    'Start a campaign: resolve recipients and fan out per-channel messages (flag-gated).',
  [NotificationsPermissions.CAMPAIGN_CANCEL]:
    'Cancel a DRAFT or QUEUED campaign; cancels pending messages.',
  [NotificationsPermissions.ENTITLEMENT_READ]:
    'Read the current school\u2019s communication entitlement snapshot.',
  [NotificationsPermissions.ENTITLEMENT_ADMIN_READ]:
    'Super-admin: list or read communication entitlements across schools.',
  [NotificationsPermissions.ENTITLEMENT_ADMIN_UPDATE]:
    'Super-admin: toggle per-channel enablement and set monthly limits for a school.',
  [NotificationsPermissions.ENTITLEMENT_ADMIN_RESET_USAGE]:
    'Super-admin: reset a school\u2019s monthly usage counters (operator-only).',
  [NotificationsPermissions.USAGE_READ]:
    'Read the current school\u2019s monthly communication usage counters.',
  [NotificationsPermissions.USAGE_ADMIN_READ]:
    'Super-admin: read cross-school monthly communication usage.',
  [NotificationsPermissions.PROVIDER_ADMIN_READ]:
    'Super-admin: list registered channel adapters with their per-flag enabled state.',
  [NotificationsPermissions.EVENT_READ]:
    'List the code-side event catalog (key, category, defaultPriority, audience, description).',
  [NotificationsPermissions.EVENT_TEST_FIRE]:
    'Super-admin: test-fire an event with a sample payload (flag-gated).',
});

// ---------------------------------------------------------------------------
// Feature flags — 13 keys.
// ---------------------------------------------------------------------------
export const NotificationsFeatureFlags = {
  MODULE: 'module.notifications',
  ALLOW_BROADCAST: 'notifications.allow_broadcast',
  ALLOW_SCHEDULED: 'notifications.allow_scheduled',
  QUIET_HOURS_ENFORCED: 'notifications.quiet_hours_enforced',
  CHANNEL_EMAIL: 'comms.channel.email',
  CHANNEL_SMS: 'comms.channel.sms',
  CHANNEL_WHATSAPP: 'comms.channel.whatsapp',
  CHANNEL_IN_APP: 'comms.channel.in_app',
  PROVIDER_SES: 'comms.provider.ses',
  PROVIDER_SENDGRID: 'comms.provider.sendgrid',
  PROVIDER_MSG91: 'comms.provider.msg91',
  PROVIDER_TWILIO: 'comms.provider.twilio',
  PROVIDER_WABA: 'comms.provider.waba',
} as const;

export type NotificationsFeatureFlag =
  (typeof NotificationsFeatureFlags)[keyof typeof NotificationsFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics — 17 keys.
// ---------------------------------------------------------------------------
export const NotificationsOutboxTopics = {
  TEMPLATE_CREATED: 'notification.template.created',
  TEMPLATE_UPDATED: 'notification.template.updated',
  TEMPLATE_DELETED: 'notification.template.deleted',
  TEMPLATE_VERSION_CREATED: 'notification.template.version_created',
  TEMPLATE_ACTIVATED: 'notification.template.activated',
  TEMPLATE_DEACTIVATED: 'notification.template.deactivated',

  MESSAGE_QUEUED: 'notification.queued',
  MESSAGE_DELIVERED: 'notification.delivered',
  MESSAGE_FAILED: 'notification.failed',
  MESSAGE_DEAD_LETTERED: 'notification.dead_lettered',
  MESSAGE_CANCELLED: 'notification.cancelled',
  MESSAGE_READ: 'notification.read',

  CAMPAIGN_CREATED: 'notification.campaign.created',
  CAMPAIGN_STARTED: 'notification.campaign.started',
  CAMPAIGN_CANCELLED: 'notification.campaign.cancelled',

  PREFERENCE_UPDATED: 'notification.preference.updated',

  ENTITLEMENT_UPDATED: 'comms.entitlement.updated',
  QUOTA_EXHAUSTED: 'comms.quota.exhausted',
} as const;

export type NotificationsOutboxTopic =
  (typeof NotificationsOutboxTopics)[keyof typeof NotificationsOutboxTopics];

// ---------------------------------------------------------------------------
// Enum value tuples — kept alongside DTOs for `@IsEnum` use.
// ---------------------------------------------------------------------------
export const NOTIFICATION_CHANNEL_VALUES = ['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH'] as const;
export type NotificationChannelValue = (typeof NOTIFICATION_CHANNEL_VALUES)[number];

export const NOTIFICATION_CATEGORY_VALUES = [
  'ACADEMIC',
  'ATTENDANCE',
  'EXAMINATION',
  'FEES',
  'ADMISSIONS',
  'STAFF',
  'TIMETABLE',
  'FINANCE',
  'COMMUNICATION',
  'SYSTEM',
] as const;
export type NotificationCategoryValue = (typeof NOTIFICATION_CATEGORY_VALUES)[number];

export const NOTIFICATION_PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type NotificationPriorityValue = (typeof NOTIFICATION_PRIORITY_VALUES)[number];

export const NOTIFICATION_MESSAGE_STATUS_VALUES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELLED',
  'READ',
] as const;
export type NotificationMessageStatusValue =
  (typeof NOTIFICATION_MESSAGE_STATUS_VALUES)[number];

export const NOTIFICATION_CAMPAIGN_STATUS_VALUES = [
  'DRAFT',
  'QUEUED',
  'SENDING',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export type NotificationCampaignStatusValue =
  (typeof NOTIFICATION_CAMPAIGN_STATUS_VALUES)[number];

export const NOTIFICATION_CAMPAIGN_TARGET_VALUES = [
  'SCHOOL',
  'BRANCH',
  'CLASS',
  'SECTION',
] as const;
export type NotificationCampaignTargetValue =
  (typeof NOTIFICATION_CAMPAIGN_TARGET_VALUES)[number];

export const NOTIFICATION_AUDIENCE_VALUES = ['USER', 'PARENT', 'STUDENT'] as const;
export type NotificationAudienceValue = (typeof NOTIFICATION_AUDIENCE_VALUES)[number];

// ---------------------------------------------------------------------------
// Numeric / format guardrails.
// ---------------------------------------------------------------------------
/** Template code character set — uppercase, digits, underscores, dashes, dots. */
export const NOTIFICATION_CODE_PATTERN = /^[A-Z0-9_\-\.]{2,60}$/;

/** Event-key character set — uppercase letters and underscores only. */
export const EVENT_KEY_PATTERN = /^[A-Z_]+$/;

/** Quiet-hours HH:MM 24-hour format. */
export const QUIET_HOURS_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hard ceiling on template body (text or HTML) length, in characters. */
export const MAX_TEMPLATE_BODY_LENGTH = 50000;

/** Hard ceiling on per-channel monthly limit (sanity guardrail). */
export const MAX_MONTHLY_LIMIT = 10_000_000;

/** Default quiet-hours window start (IST). */
export const DEFAULT_QUIET_HOURS_START = '21:00';

/** Default quiet-hours window end (IST). */
export const DEFAULT_QUIET_HOURS_END = '07:00';

/** Default quiet-hours timezone (BUSINESS_RULES §8 — India primary market). */
export const DEFAULT_QUIET_HOURS_TIMEZONE = 'Asia/Kolkata';

/** Default locale stamped on templates and preferences. */
export const DEFAULT_LOCALE = 'en-IN';

/** Default per-message retry ceiling before dead-letter. */
export const DEFAULT_MAX_ATTEMPTS = 5;
