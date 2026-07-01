/**
 * Outbox-event permission keys (4 total). Outbox is operator-grade plumbing;
 * tenant users do not see it. All keys are PLATFORM_ONLY.
 */
export const OutboxPermissions = {
  READ: 'outbox.read',
  REPLAY: 'outbox.replay',
  DEAD_LETTER_READ: 'outbox.dead_letter.read',
  DEAD_LETTER_REPLAY: 'outbox.dead_letter.replay',
} as const;

export type OutboxPermission = (typeof OutboxPermissions)[keyof typeof OutboxPermissions];

export const OUTBOX_PERMISSION_DESCRIPTIONS: Readonly<Record<OutboxPermission, string>> =
  Object.freeze({
    [OutboxPermissions.READ]: 'List and read outbox events.',
    [OutboxPermissions.REPLAY]: 'Re-queue a delivered or failed outbox event for delivery.',
    [OutboxPermissions.DEAD_LETTER_READ]: 'List outbox events that exhausted retries (status=dead).',
    [OutboxPermissions.DEAD_LETTER_REPLAY]: 'Replay a dead-lettered outbox event.',
  });

export const OUTBOX_STATUS = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  DEAD: 'dead',
} as const);

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];
