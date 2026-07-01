/**
 * Communication Center module constants — permissions, feature flag keys
 * and outbox topic strings for the orchestration layer that sits on top
 * of Sprint 10 Notifications + Sprint 18 Job Scheduler.
 *
 * The Communication Center adds NO new providers, dispatchers or storage
 * — every constant here either gates an orchestration endpoint or
 * captures an operational event that mirrors an underlying notification
 * lifecycle transition.
 */

// ---------------------------------------------------------------------------
// Permissions — 9 keys, all under the `communication-center.*` namespace.
// ---------------------------------------------------------------------------
export const CommunicationCenterPermissions = {
  DASHBOARD_READ: 'communication-center.dashboard.read',
  BROADCAST_CREATE: 'communication-center.broadcast.create',
  BROADCAST_CANCEL: 'communication-center.broadcast.cancel',
  BROADCAST_RETRY: 'communication-center.broadcast.retry',
  TIMELINE_READ: 'communication-center.timeline.read',
  SCHEDULE_MANAGE: 'communication-center.schedule.manage',
  MONITORING_READ: 'communication-center.monitoring.read',
  ANALYTICS_READ: 'communication-center.analytics.read',
  SEARCH_READ: 'communication-center.search.read',
} as const;

export type CommunicationCenterPermission =
  (typeof CommunicationCenterPermissions)[keyof typeof CommunicationCenterPermissions];

export const COMMUNICATION_CENTER_PERMISSION_DESCRIPTIONS: Readonly<
  Record<CommunicationCenterPermission, string>
> = Object.freeze({
  [CommunicationCenterPermissions.DASHBOARD_READ]:
    'Read the Communication Center dashboard rollups (counters, by-status totals).',
  [CommunicationCenterPermissions.BROADCAST_CREATE]:
    'Create an operational broadcast (wraps NotificationCampaign DRAFT + start).',
  [CommunicationCenterPermissions.BROADCAST_CANCEL]:
    'Cancel a queued / scheduled broadcast (cancels its campaign + scheduled job).',
  [CommunicationCenterPermissions.BROADCAST_RETRY]:
    'Request a retry of failed messages belonging to a broadcast (emits orchestration event).',
  [CommunicationCenterPermissions.TIMELINE_READ]:
    'Read the per-message lifecycle timeline (created / sent / delivered / read / failed).',
  [CommunicationCenterPermissions.SCHEDULE_MANAGE]:
    'Create, reschedule, retry or cancel scheduled communications via the Job Scheduler.',
  [CommunicationCenterPermissions.MONITORING_READ]:
    'Read delivery monitoring summaries (pending / queued / sent / delivered / read / failed / cancelled).',
  [CommunicationCenterPermissions.ANALYTICS_READ]:
    'Read backend communication analytics (delivery rate, read rate, failure rate, channel mix).',
  [CommunicationCenterPermissions.SEARCH_READ]:
    'Search communications by linked aggregate (student / parent / staff / homework / fee / event ...).',
});

// ---------------------------------------------------------------------------
// Feature flag — single MODULE gate.
// ---------------------------------------------------------------------------
export const CommunicationCenterFeatureFlags = {
  MODULE: 'module.communication_center',
} as const;

export type CommunicationCenterFeatureFlag =
  (typeof CommunicationCenterFeatureFlags)[keyof typeof CommunicationCenterFeatureFlags];

// ---------------------------------------------------------------------------
// Outbox topics — 7 orchestration events.
//
// These mirror the underlying `notification.*` and `notification.campaign.*`
// topics; subscribers that want operational hooks (audit dashboards,
// after-the-fact reporting) attach here without having to reason about
// notification-internal events.
// ---------------------------------------------------------------------------
export const CommunicationCenterOutboxTopics = {
  BROADCAST_CREATED: 'comms.center.broadcast.created',
  BROADCAST_SCHEDULED: 'comms.center.broadcast.scheduled',
  BROADCAST_CANCELLED: 'comms.center.broadcast.cancelled',
  BROADCAST_RETRY_REQUESTED: 'comms.center.broadcast.retry_requested',
  COMMUNICATION_SCHEDULE_UPDATED: 'comms.center.schedule.updated',
  COMMUNICATION_SCHEDULE_CANCELLED: 'comms.center.schedule.cancelled',
  COMMUNICATION_RETRY_REQUESTED: 'comms.center.communication.retry_requested',
} as const;

export type CommunicationCenterOutboxTopic =
  (typeof CommunicationCenterOutboxTopics)[keyof typeof CommunicationCenterOutboxTopics];

// ---------------------------------------------------------------------------
// Job-scheduler queues / handler names.
// ---------------------------------------------------------------------------
export const CommunicationCenterJobs = {
  QUEUE: 'comms-center',
  SCHEDULED_BROADCAST_START_HANDLER: 'comms.scheduled-broadcast.start',
} as const;
