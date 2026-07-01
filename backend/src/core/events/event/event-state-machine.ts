/**
 * Event lifecycle state machine — pure functions used by `EventService` to
 * gate transitions between `EventStatus` values.
 *
 * Allowed transitions:
 *   DRAFT      → SCHEDULED | CANCELLED
 *   SCHEDULED  → PUBLISHED | CANCELLED
 *   PUBLISHED  → ONGOING   | CANCELLED
 *   ONGOING    → COMPLETED | CANCELLED
 *   COMPLETED  → (terminal)
 *   CANCELLED  → (terminal)
 *
 * `EVENT_EDITABLE_FIELDS` declares which patch fields are allowed once the
 * event leaves DRAFT. The set is restricted to schedule shifts + venue +
 * capacity + budget metadata; everything else throws `EventNotEditableError`.
 */
import {
  EventInvalidStateTransitionError,
  EventNotEditableError,
} from '../events.errors';
import type { EventStatusValue } from '../events.constants';

const TRANSITIONS: Readonly<Record<EventStatusValue, readonly EventStatusValue[]>> =
  Object.freeze({
    DRAFT: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['PUBLISHED', 'CANCELLED'],
    PUBLISHED: ['ONGOING', 'CANCELLED'],
    ONGOING: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  });

export const TERMINAL_EVENT_STATUSES: ReadonlySet<EventStatusValue> = new Set([
  'COMPLETED',
  'CANCELLED',
]);

export function canTransition(
  from: EventStatusValue,
  to: EventStatusValue,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  id: string,
  from: EventStatusValue,
  to: EventStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new EventInvalidStateTransitionError(id, from, to);
  }
}

/**
 * Fields editable on PATCH once the event is past DRAFT. DRAFT permits all
 * fields; SCHEDULED / PUBLISHED / ONGOING permit only schedule shifts and
 * read-only metadata.
 */
export const EVENT_EDITABLE_FIELDS_POST_DRAFT: ReadonlySet<string> = new Set([
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'venue',
  'registrationCapacity',
  'estimatedCost',
  'actualCost',
  'sponsorshipAmount',
  'description',
]);

export function assertFieldEditable(
  id: string,
  status: EventStatusValue,
  field: string,
): void {
  if (status === 'DRAFT') return;
  if (TERMINAL_EVENT_STATUSES.has(status)) {
    throw new EventNotEditableError(id, status, field);
  }
  if (!EVENT_EDITABLE_FIELDS_POST_DRAFT.has(field)) {
    throw new EventNotEditableError(id, status, field);
  }
}
