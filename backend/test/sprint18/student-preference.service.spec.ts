/**
 * StudentPreferenceService unit spec — Sprint 18 W8.
 *
 * One assertion (per plan §9): PATCH `channelPush=false` persists and the
 * subsequent `shouldDeliver(PUSH, ...)` call returns `OPTED_OUT`. Wires the
 * real `NotificationPreferenceService` against an in-memory mock repo so
 * the spec covers wrapper → service → shouldDeliver end-to-end.
 */
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_QUIET_HOURS_TIMEZONE,
} from '../../src/core/notifications/notifications.constants';
import { NotificationPreferenceService } from '../../src/core/notifications/notification-preference/notification-preference.service';
import type { NotificationUserPreferenceRow } from '../../src/core/notifications/notifications.types';
import { RequestContextRegistry } from '../../src/core/request-context';
import { StudentPreferenceService } from '../../src/core/student/preferences/student-preference.service';

const SCHOOL = 'school-1';
const USER = 'user-1';
const NOW = new Date('2026-06-25T00:00:00.000Z');

function basePref(
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
    channelPush: true,
    emergencyOverride: true,
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

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('StudentPreferenceService.updateMine', () => {
  it('PATCH channelPush=false persists and shouldDeliver(PUSH, ...) returns OPTED_OUT', async () => {
    let current = basePref();

    const prisma = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    const repo = {
      findByUser: jest.fn(async () => current),
      create: jest.fn(),
      update: jest.fn(
        async (
          _tx: unknown,
          _s: string,
          _id: string,
          expectedVersion: number,
          _u: string | null,
          patch: Partial<NotificationUserPreferenceRow>,
        ) => {
          current = { ...current, ...patch, version: expectedVersion + 1 };
          return current;
        },
      ),
    };
    const featureFlags = { isEnabled: jest.fn(async () => true) };
    const outbox = { publish: jest.fn(async () => undefined) };
    const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
    const preferences = new NotificationPreferenceService(
      prisma as never,
      repo as never,
      featureFlags as never,
      outbox as never,
      audit as never,
    );
    const studentUsers = {
      findAliveByUserId: jest.fn(async () => ({
        id: 'su-1',
        userId: USER,
        schoolId: SCHOOL,
        status: 'ACTIVE',
      })),
    };

    const svc = new StudentPreferenceService(
      featureFlags as never,
      preferences,
      studentUsers as never,
    );

    await withCtx(() => svc.updateMine(1, { channelPush: false }));

    expect(current.channelPush).toBe(false);

    const outsideQuiet = new Date('2026-06-25T06:30:00.000Z');
    const result = await withCtx(() =>
      preferences.shouldDeliver(
        {} as never,
        SCHOOL,
        USER,
        'PUSH',
        'ACADEMIC',
        'MEDIUM',
        outsideQuiet,
      ),
    );
    expect(result.allowed).toBe(false);
    expect(result.skipReason).toBe('OPTED_OUT');
  });
});
