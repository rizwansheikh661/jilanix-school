/**
 * EventsNotificationBootstrap unit spec — verifies the 6 event-key catalog
 * entries are registered with NotificationEventRegistry on application
 * bootstrap.
 */
import { EventsNotificationEventKeys } from './events.constants';
import { EventsNotificationBootstrap } from './events-notification-bootstrap';

describe('EventsNotificationBootstrap', () => {
  it('registers all 6 events notification keys', () => {
    const registry = { register: jest.fn() };
    const bootstrap = new EventsNotificationBootstrap(registry as never);
    bootstrap.onApplicationBootstrap();

    expect(registry.register).toHaveBeenCalledTimes(6);
    const seen = (registry.register.mock.calls as unknown as Array<[{ key: string }]>).map(
      (c) => c[0].key,
    );
    expect(new Set(seen)).toEqual(new Set(Object.values(EventsNotificationEventKeys)));
  });

  it('uses COMMUNICATION category and USER audience for every key', () => {
    const registry = { register: jest.fn() };
    new EventsNotificationBootstrap(registry as never).onApplicationBootstrap();

    const calls = registry.register.mock.calls as unknown as Array<
      [{ category: string; audience: string }]
    >;
    for (const [def] of calls) {
      expect(def.category).toBe('COMMUNICATION');
      expect(def.audience).toBe('USER');
    }
  });

  it('assigns HIGH priority to EVENT_REMINDER and EVENT_CANCELLED', () => {
    const registry = { register: jest.fn() };
    new EventsNotificationBootstrap(registry as never).onApplicationBootstrap();

    const calls = registry.register.mock.calls as unknown as Array<
      [{ key: string; defaultPriority: string }]
    >;
    const byKey = Object.fromEntries(calls.map(([d]) => [d.key, d]));
    expect(byKey['EVENT_REMINDER']?.defaultPriority).toBe('HIGH');
    expect(byKey['EVENT_CANCELLED']?.defaultPriority).toBe('HIGH');
    expect(byKey['EVENT_CREATED']?.defaultPriority).toBe('LOW');
    expect(byKey['EVENT_REGISTRATION_CLOSED']?.defaultPriority).toBe('LOW');
  });

  it('is idempotent across multiple bootstraps', () => {
    const registry = { register: jest.fn() };
    const bootstrap = new EventsNotificationBootstrap(registry as never);
    bootstrap.onApplicationBootstrap();
    bootstrap.onApplicationBootstrap();
    expect(registry.register).toHaveBeenCalledTimes(12);
  });
});
