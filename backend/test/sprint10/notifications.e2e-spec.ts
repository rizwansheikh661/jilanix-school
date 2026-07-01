/**
 * Sprint 10 e2e — Notifications full lifecycle.
 *
 * Service-orchestration spec (no Testcontainers, no real DB, no Nest
 * TestingModule), mirroring the Sprint 9 fees e2e pattern. Three real
 * services — `NotificationTemplateService`, `NotificationMessageService`,
 * `NotificationInboxService` — are wired with stubbed repos backed by a
 * shared in-memory store so a template created in step 1 powers a
 * send-test in step 6 and the resulting in-app message lights up the
 * inbox in steps 8-11.
 *
 * Permissions/RBAC are exercised in unit tests against the guards; this
 * e2e drives the service tier directly through `RequestContextRegistry`
 * with the `tenant` actor scope after seeding a school + user + role that
 * holds every Sprint 10 permission key relevant to the flow.
 *
 * Flow:
 *   1. Seed school + user + role with all notification-template /
 *      -message / -inbox / -preference permissions.
 *   2. Create IN_APP template (TIMETABLE_PUBLISHED, ACADEMIC) — assert
 *      activeVersionNo === 1.
 *   3. Append version 2 — assert header.activeVersionNo flips to 2 and
 *      listVersions returns both rows oldest-first.
 *   4. Deactivate → activate cycle on the template header.
 *   5. send-test with payload {className:'5A'} — message stored with
 *      channel=IN_APP, status=DELIVERED, sentAt + deliveredAt set, body
 *      rendered with the payload substituted in.
 *   6. Inbox unread-count == 1, feed returns 1 item.
 *   7. mark-read flips to READ; unread-count drops to 0.
 *   8. Outbox topic set contains template.created, template.version_created,
 *      template.activated, template.deactivated, notification.delivered,
 *      notification.read.
 */
import { AuditService } from '../../src/core/audit/audit.service';
import { NotificationInboxService } from '../../src/core/notifications/notification-inbox/notification-inbox.service';
import { NotificationMessageService } from '../../src/core/notifications/notification-message/notification-message.service';
import { NotificationTemplateService } from '../../src/core/notifications/notification-template/notification-template.service';
import { NotificationsOutboxTopics } from '../../src/core/notifications/notifications.constants';
import { RequestContextRegistry } from '../../src/core/request-context';
import {
  createNotificationsHarness,
  seedRoleWithPermissions,
} from './helpers';

const SCHOOL = 'sch-e2e10-lifecycle';
const USER = 'usr-e2e10-lifecycle';
const ROLE = 'role-e2e10-operator';
const NOW = new Date('2026-06-22T12:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: USER,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 10 e2e — notifications full lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('template CRUD + activation cycle → send-test renders payload → inbox read flow → outbox audit fan-out', async () => {
    // ----- 1. Seed school + user + role with Sprint 10 permissions -----
    const role = seedRoleWithPermissions(ROLE, [
      'notification-template.read',
      'notification-template.create',
      'notification-template.update',
      'notification-template.delete',
      'notification-template.activate',
      'notification-template.deactivate',
      'notification-template.create-version',
      'notification-message.read',
      'notification-message.cancel',
      'notification-message.send-test',
      'notification-inbox.read',
      'notification-inbox.mark-read',
      'notification-preference.read',
      'notification-preference.update',
    ]);
    expect(role.permissions).toContain('notification-template.create');

    // Wire services with a shared in-memory store. Outbox/audit are
    // accumulators we assert against at the end of the flow.
    const h = createNotificationsHarness({ schoolId: SCHOOL });

    const templateSvc = new NotificationTemplateService(
      h.prisma as never,
      h.templateRepo as never,
      h.featureFlags as never,
      h.outbox as never,
      h.audit as never,
    );

    const messageSvc = new NotificationMessageService(
      h.prisma as never,
      h.messageRepo as never,
      h.templateRepo as never,
      h.eventRegistry as never,
      h.outbox as never,
      h.audit as never,
      h.featureFlags as never,
    );

    const inboxSvc = new NotificationInboxService(
      h.prisma as never,
      h.outbox as never,
      // AuditService injected by signature but inbox spec deliberately
      // skips audit log writes. Stubbed for DI shape only.
      { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) } as unknown as AuditService,
      h.featureFlags as never,
    );

    // ----- 2. Create IN_APP template, active version 1 -----
    const created = await withCtx(() =>
      templateSvc.create({
        code: 'TPL-TT-PUB',
        name: 'Timetable published',
        channel: 'IN_APP',
        category: 'ACADEMIC',
        eventKey: 'TIMETABLE_PUBLISHED',
        bodyText: 'Class {{className}} timetable is now live.',
      }),
    );
    expect(created.header.activeVersionNo).toBe(1);
    expect(created.activeVersion?.versionNo).toBe(1);
    expect(created.activeVersion?.bodyText).toBe(
      'Class {{className}} timetable is now live.',
    );

    const templateId = created.header.id;

    // ----- 3. Append version 2 → activeVersionNo bumps, two versions visible -----
    const v2 = await withCtx(() =>
      templateSvc.appendVersion(templateId, created.header.version, {
        bodyText: 'Class {{className}} timetable (v2) is now live.',
      }),
    );
    expect(v2.header.activeVersionNo).toBe(2);
    expect(v2.version.versionNo).toBe(2);

    const versions = await withCtx(() => templateSvc.listVersions(templateId));
    expect(versions.map((v) => v.versionNo)).toEqual([1, 2]);

    // ----- 4. Deactivate → reactivate -----
    const deactivated = await withCtx(() =>
      templateSvc.deactivate(templateId, v2.header.version),
    );
    expect(deactivated.isActive).toBe(false);

    const reactivated = await withCtx(() =>
      templateSvc.activate(templateId, deactivated.version),
    );
    expect(reactivated.isActive).toBe(true);

    // ----- 5. send-test with payload {className:'5A'} -----
    const message = await withCtx(() =>
      messageSvc.sendTest({
        templateId,
        recipientUserId: USER,
        payload: { className: '5A' },
      }),
    );
    expect(message.channel).toBe('IN_APP');
    expect(message.status).toBe('DELIVERED');
    expect(message.sentAt).not.toBeNull();
    expect(message.deliveredAt).not.toBeNull();
    expect(message.bodyRendered).toContain('5A');
    expect(message.recipientUserId).toBe(USER);

    // ----- 6. Inbox unread-count → 1, feed surfaces the message -----
    const before = await withCtx(() => inboxSvc.unreadCount());
    expect(before.count).toBe(1);

    const feed = await withCtx(() => inboxSvc.feed({}));
    expect(feed.items.length).toBe(1);
    expect(feed.items[0]!.id).toBe(message.id);
    expect(feed.items[0]!.readAt).toBeNull();

    // ----- 7. mark-read flips to READ; unread drops to 0 -----
    const read = await withCtx(() => inboxSvc.markRead(message.id));
    expect(read.readAt).not.toBeNull();
    expect(read.status).toBe('READ');

    const after = await withCtx(() => inboxSvc.unreadCount());
    expect(after.count).toBe(0);

    // ----- 8. Outbox fan-out across the full flow -----
    const topics = h.outboxTopics();
    expect(topics).toEqual(
      expect.arrayContaining([
        NotificationsOutboxTopics.TEMPLATE_CREATED,
        NotificationsOutboxTopics.TEMPLATE_VERSION_CREATED,
        NotificationsOutboxTopics.TEMPLATE_ACTIVATED,
        NotificationsOutboxTopics.TEMPLATE_DEACTIVATED,
        NotificationsOutboxTopics.MESSAGE_DELIVERED,
        NotificationsOutboxTopics.MESSAGE_READ,
      ]),
    );

    // The deliver/read pair are emitted exactly once each in this flow.
    expect(topics.filter((t) => t === NotificationsOutboxTopics.MESSAGE_DELIVERED)).toHaveLength(1);
    expect(topics.filter((t) => t === NotificationsOutboxTopics.MESSAGE_READ)).toHaveLength(1);

    // Template lifecycle audits recorded for create / version_create /
    // activate / deactivate.
    const actions = h.auditActions();
    expect(actions).toEqual(
      expect.arrayContaining([
        'notification_template.create',
        'notification_template.version_create',
        'notification_template.activate',
        'notification_template.deactivate',
        'notification_message.send_test',
      ]),
    );
  });
});
