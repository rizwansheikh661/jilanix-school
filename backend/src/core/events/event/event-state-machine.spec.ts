/**
 * Pure-function state-machine spec — verifies the Event lifecycle
 * transition matrix and the post-DRAFT field-editability whitelist.
 */
import { EVENT_STATUS_VALUES } from '../events.constants';
import {
  EventInvalidStateTransitionError,
  EventNotEditableError,
} from '../events.errors';
import {
  EVENT_EDITABLE_FIELDS_POST_DRAFT,
  TERMINAL_EVENT_STATUSES,
  assertFieldEditable,
  assertTransition,
  canTransition,
} from './event-state-machine';

describe('event-state-machine', () => {
  const ID = 'evt-1';

  describe('canTransition / assertTransition', () => {
    const allowed: ReadonlyArray<[string, string]> = [
      ['DRAFT', 'SCHEDULED'],
      ['DRAFT', 'CANCELLED'],
      ['SCHEDULED', 'PUBLISHED'],
      ['SCHEDULED', 'CANCELLED'],
      ['PUBLISHED', 'ONGOING'],
      ['PUBLISHED', 'CANCELLED'],
      ['ONGOING', 'COMPLETED'],
      ['ONGOING', 'CANCELLED'],
    ];

    it.each(allowed)('permits %s → %s', (from, to) => {
      expect(canTransition(from as never, to as never)).toBe(true);
      expect(() => assertTransition(ID, from as never, to as never)).not.toThrow();
    });

    it('refuses every other pair', () => {
      const allowedSet = new Set(allowed.map(([f, t]) => `${f}->${t}`));
      for (const from of EVENT_STATUS_VALUES) {
        for (const to of EVENT_STATUS_VALUES) {
          if (from === to) continue;
          if (allowedSet.has(`${from}->${to}`)) continue;
          expect(canTransition(from, to)).toBe(false);
          expect(() => assertTransition(ID, from, to)).toThrow(
            EventInvalidStateTransitionError,
          );
        }
      }
    });

    it('COMPLETED and CANCELLED are terminal', () => {
      expect(TERMINAL_EVENT_STATUSES.has('COMPLETED')).toBe(true);
      expect(TERMINAL_EVENT_STATUSES.has('CANCELLED')).toBe(true);
      expect(TERMINAL_EVENT_STATUSES.size).toBe(2);
    });
  });

  describe('assertFieldEditable', () => {
    it('permits every field in DRAFT', () => {
      for (const field of ['name', 'category', 'eventType', 'isFree', 'registrationType']) {
        expect(() => assertFieldEditable(ID, 'DRAFT', field)).not.toThrow();
      }
    });

    it('permits only whitelisted fields once past DRAFT', () => {
      for (const status of ['SCHEDULED', 'PUBLISHED', 'ONGOING'] as const) {
        for (const field of EVENT_EDITABLE_FIELDS_POST_DRAFT) {
          expect(() => assertFieldEditable(ID, status, field)).not.toThrow();
        }
        for (const field of ['name', 'eventType', 'category', 'isFree']) {
          expect(() => assertFieldEditable(ID, status, field)).toThrow(
            EventNotEditableError,
          );
        }
      }
    });

    it('rejects every field in terminal statuses', () => {
      for (const status of ['COMPLETED', 'CANCELLED'] as const) {
        for (const field of ['startDate', 'name', 'venue']) {
          expect(() => assertFieldEditable(ID, status, field)).toThrow(
            EventNotEditableError,
          );
        }
      }
    });
  });
});
