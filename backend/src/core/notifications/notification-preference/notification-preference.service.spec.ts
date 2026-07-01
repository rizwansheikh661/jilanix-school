/**
 * NotificationPreferenceService unit specs — default lazy-create,
 * idempotent reads, update + outbox/audit, and the pure `shouldDeliver`
 * predicate consumed by the dispatcher (channel toggle, category opt-out,
 * quiet-hours, critical-priority bypass).
 */
import { RequestContextRegistry } from '../../request-context';
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_QUIET_HOURS_TIMEZONE,
  NotificationsOutboxTopics,
} from '../notifications.constants';
import type { NotificationUserPreferenceRow } from '../notifications.types';
import { NotificationPreferenceService } from './notification-preference.service';

const SCHOOL = 'school-1';
const USER = 'user-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makePref(
  overrides: Partial<NotificationUserPreferenceRow> = {},
): NotificationUserPreferenceRow {
  return {
    id: 'np-1',
    schoolId: SCHOOL,
    userId: USER,
    channelEmail: true,
    channelSms: true,
    channelWhatsapp: true,
    channelInApp: true,
    categoryOptOuts: null,
    quietHoursStart: DEFAULT_QUIET_HOURS_START,
    quietHoursEnd: DEFAULT_QUIET_HOURS_END,
    quietHoursTimezone: DEFAULT_QUIET_HOURS_TIMEZONE,
    locale: 'en-IN',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as unknown as NotificationUserPreferenceRow;
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    findByUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new NotificationPreferenceService(
    prisma as never,
    repo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, prisma, repo, featureFlags, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('NotificationPreferenceService.getOrCreateDefault', () => {
  it('lazy-creates with channel defaults and IST quiet hours when missing', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(null);
    t.repo.create.mockImplementation(
      async (_tx: unknown, _s: string, _u: string | null, data: Record<string, unknown>) =>
        makePref(data),
    );

    const out = await withCtx(() => t.svc.getOrCreateDefault());

    expect(out.channelEmail).toBe(true);
    expect(out.channelSms).toBe(true);
    expect(out.channelWhatsapp).toBe(true);
    expect(out.channelInApp).toBe(true);
    expect(out.quietHoursStart).toBe('21:00');
    expect(out.quietHoursEnd).toBe('07:00');
    expect(out.quietHoursTimezone).toBe('Asia/Kolkata');
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    // Lazy create is silent — no outbox / audit.
    expect(t.outbox.publish).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('returns the existing row on subsequent calls without inserting', async () => {
    const t = makeService();
    const existing = makePref({ channelEmail: false });
    t.repo.findByUser.mockResolvedValue(existing);

    const out = await withCtx(() => t.svc.getOrCreateDefault());

    expect(out).toBe(existing);
    expect(t.repo.create).not.toHaveBeenCalled();
  });
});

describe('NotificationPreferenceService.update', () => {
  it('patches channels + categoryOptOuts + quiet hours, bumps version, emits outbox', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref({ version: 1 }));
    t.repo.update.mockResolvedValue(
      makePref({
        version: 2,
        channelEmail: false,
        categoryOptOuts: { ACADEMIC: ['EMAIL'] } as never,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      }),
    );

    const out = await withCtx(() =>
      t.svc.update(1, {
        channelEmail: false,
        categoryOptOuts: { ACADEMIC: ['EMAIL'] },
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      }),
    );

    expect(out.version).toBe(2);
    expect(out.channelEmail).toBe(false);

    const updateArgs = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, string | null, Record<string, unknown>]
    >)[0]!;
    expect(updateArgs[3]).toBe(1);
    expect(updateArgs[5]).toEqual(
      expect.objectContaining({
        channelEmail: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      }),
    );

    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.PREFERENCE_UPDATED,
        eventType: 'NotificationPreferenceUpdated',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationPreferenceService.shouldDeliver', () => {
  it('allows when no preference row exists (defaults assumed) outside quiet hours', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(null);
    // 12:00 IST = 06:30 UTC. Outside default 21:00-07:00 IST window.
    const now = new Date('2026-06-22T06:30:00.000Z');
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(true);
    expect(out.skipReason).toBeUndefined();
  });

  it('blocks when channel disabled (channelEmail=false, channel=EMAIL -> OPTED_OUT)', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref({ channelEmail: false }));
    const now = new Date('2026-06-22T06:30:00.000Z'); // outside quiet hours
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('OPTED_OUT');
  });

  it('blocks when category opted out for that channel', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(
      makePref({ categoryOptOuts: { ACADEMIC: ['EMAIL'] } as never }),
    );
    const now = new Date('2026-06-22T06:30:00.000Z');
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('OPTED_OUT');
  });

  it('blocks during quiet hours (23:00 IST inside 21:00-07:00)', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref());
    // 23:00 IST = 17:30 UTC.
    const now = new Date('2026-06-22T17:30:00.000Z');
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('QUIET_HOURS');
  });

  it('allows outside quiet hours (12:00 IST outside 21:00-07:00)', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref());
    // 12:00 IST = 06:30 UTC.
    const now = new Date('2026-06-22T06:30:00.000Z');
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(true);
  });

  it('correctly handles a midnight-spanning quiet-hours window (02:00 IST is inside 21:00-07:00)', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref());
    // 02:00 IST = 20:30 UTC the previous day.
    const now = new Date('2026-06-21T20:30:00.000Z');
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('QUIET_HOURS');
  });

  it('CRITICAL priority bypasses opt-out and quiet hours when emergencyOverride=true', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(
      makePref({
        channelEmail: false,
        categoryOptOuts: { ACADEMIC: ['EMAIL'] } as never,
        emergencyOverride: true,
      } as never),
    );
    const now = new Date('2026-06-22T17:30:00.000Z'); // inside quiet hours
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'CRITICAL', now),
    );
    expect(out.allowed).toBe(true);
  });

  it('CRITICAL priority respects opt-out when emergencyOverride=false', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(
      makePref({
        channelEmail: false,
        emergencyOverride: false,
      } as never),
    );
    const now = new Date('2026-06-22T06:30:00.000Z'); // outside quiet hours
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'EMAIL', 'ACADEMIC', 'CRITICAL', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('OPTED_OUT');
  });

  it('PUSH channel with channelPush=false returns OPTED_OUT', async () => {
    const t = makeService();
    t.repo.findByUser.mockResolvedValue(makePref({ channelPush: false } as never));
    const now = new Date('2026-06-22T06:30:00.000Z'); // outside quiet hours
    const out = await withCtx(() =>
      t.svc.shouldDeliver({} as never, SCHOOL, USER, 'PUSH', 'ACADEMIC', 'MEDIUM', now),
    );
    expect(out.allowed).toBe(false);
    expect(out.skipReason).toBe('OPTED_OUT');
  });
});
