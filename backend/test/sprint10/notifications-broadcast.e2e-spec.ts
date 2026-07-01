/**
 * Sprint 10 e2e — Campaign broadcast end-to-end.
 *
 * Service-orchestration spec mirroring the Sprint 9 pattern (no
 * Testcontainers, no real DB, no Nest TestingModule).
 *
 * What this exercises:
 *   1. Seeds 5 active users on a school.
 *   2. Creates an IN_APP template (category=ACADEMIC, audience=USER) so
 *      the campaign flow does not need to engage the entitlement quota
 *      engine (IN_APP bypasses it — verified in the quota spec).
 *   3. Creates a SCHOOL-target campaign referencing the template.
 *   4. Stubs `NotificationPreferenceService.shouldDeliver` to return:
 *        - OPTED_OUT for one user,
 *        - QUIET_HOURS for one user,
 *        - allowed=true for the remaining three.
 *   5. Starts the campaign and asserts:
 *        - 5 recipient rows written (3 delivered, 2 skipped),
 *        - 3 NotificationMessage rows in DELIVERED status,
 *        - skip reasons in the recipient summary include {OPTED_OUT:1,
 *          QUIET_HOURS:1},
 *        - counters on the updated campaign — recipientCount=5,
 *          sentCount=3, status=COMPLETED,
 *        - outbox fan-out includes campaign.created, campaign.started,
 *          per-delivered notification.delivered (3 of them).
 *   6. Re-invoking `cancel` on the COMPLETED campaign throws
 *      `NotificationCampaignNotStartableError`.
 *
 * Stubbed bits:
 *   - `NotificationPreferenceService` is replaced with a thin mock that
 *     drives `shouldDeliver` per-user. The real service is unit-tested
 *     elsewhere; here we only need a deterministic skip-reason oracle.
 *   - `SequenceService` is mocked to return a fixed value (we also pass
 *     `code: 'CMP-E2E-1'` to skirt the sequence path, but the service
 *     still receives the mock to satisfy DI shape).
 *   - `CommunicationEntitlementService` is wired as a real instance but
 *     IN_APP traffic never invokes `assertAndIncrement` — see the
 *     channel guard in `NotificationCampaignService.start`.
 *
 * Flag setup: the `notifications.allow_broadcast` flag must be enabled
 * for `start()` to clear `assertBroadcastEnabled`.
 */
import { CommunicationEntitlementService } from '../../src/core/notifications/communication-entitlement/communication-entitlement.service';
import { NotificationCampaignService } from '../../src/core/notifications/notification-campaign/notification-campaign.service';
import { NotificationTemplateService } from '../../src/core/notifications/notification-template/notification-template.service';
import { NotificationsOutboxTopics } from '../../src/core/notifications/notifications.constants';
import { NotificationCampaignNotStartableError } from '../../src/core/notifications/notifications.errors';
import { RequestContextRegistry } from '../../src/core/request-context';
import {
  createNotificationsHarness,
  seedRoleWithPermissions,
} from './helpers';

const SCHOOL = 'sch-e2e10-broadcast';
const OPERATOR = 'usr-e2e10-operator';
const USERS = ['u-1-ok', 'u-2-ok', 'u-3-opted', 'u-4-quiet', 'u-5-ok'] as const;
const NOW = new Date('2026-06-22T12:00:00.000Z');

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL,
    userId: OPERATOR,
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('Sprint 10 e2e — campaign broadcast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('SCHOOL target, 5 users (3 ok, 1 opted-out, 1 quiet-hours) → 3 messages + 5 recipients + counters + outbox; cancel on COMPLETED is refused', async () => {
    // ----- Roles -----------------------------------------------------------
    const role = seedRoleWithPermissions('role-e2e10-broadcast', [
      'notification-template.create',
      'notification-template.read',
      'notification-campaign.create',
      'notification-campaign.read',
      'notification-campaign.start',
      'notification-campaign.cancel',
    ]);
    expect(role.permissions).toContain('notification-campaign.start');

    // ----- Harness --------------------------------------------------------
    const h = createNotificationsHarness({
      schoolId: SCHOOL,
      now: NOW,
      featureFlags: {
        'module.notifications': true,
        'notifications.allow_broadcast': true,
        'comms.channel.in_app': true,
      },
    });

    // Seed 5 active users in the in-memory store so the recipient
    // resolver's `_pageUsers` returns them. Order-sorted by id ascending
    // matches the in-memory model.
    for (const id of USERS) {
      h.state.users.push({ id, schoolId: SCHOOL, status: 'active' });
    }

    // ----- Template (IN_APP, ACADEMIC) ------------------------------------
    const templateSvc = new NotificationTemplateService(
      h.prisma as never,
      h.templateRepo as never,
      h.featureFlags as never,
      h.outbox as never,
      h.audit as never,
    );
    const tpl = await withCtx(() =>
      templateSvc.create({
        code: 'TPL-BCAST-1',
        name: 'Broadcast announcement',
        channel: 'IN_APP',
        category: 'ACADEMIC',
        eventKey: null,
        bodyText: 'School announcement.',
      }),
    );
    expect(tpl.header.activeVersionNo).toBe(1);

    // ----- Preference stub (per-user oracle) ------------------------------
    // The campaign service consumes `NotificationPreferenceService` only
    // for its `shouldDeliver` method. A thin mock keeps the test
    // deterministic and does not lock us into the real service's quiet-
    // hours timezone math.
    const preferences = {
      shouldDeliver: jest.fn(
        async (_tx: unknown, _schoolId: string, userId: string) => {
          if (userId === 'u-3-opted') {
            return { allowed: false, skipReason: 'OPTED_OUT' as const };
          }
          if (userId === 'u-4-quiet') {
            return { allowed: false, skipReason: 'QUIET_HOURS' as const };
          }
          return { allowed: true };
        },
      ),
    };

    // ----- Real entitlement service (never reached for IN_APP) -----------
    const entitlementSvc = new CommunicationEntitlementService(
      h.prisma as never,
      h.entitlementRepo as never,
      h.featureFlags as never,
      h.outbox as never,
      h.audit as never,
    );

    // ----- Sequence stub (we pass `code` explicitly anyway) --------------
    const sequences = {
      nextValue: jest.fn(async () => 1),
    };

    const campaignSvc = new NotificationCampaignService(
      h.prisma as never,
      h.campaignRepo as never,
      h.templateRepo as never,
      preferences as never,
      entitlementSvc as never,
      h.outbox as never,
      h.audit as never,
      h.featureFlags as never,
      sequences as never,
    );

    // ----- Create campaign ------------------------------------------------
    const created = await withCtx(() =>
      campaignSvc.create({
        code: 'CMP-E2E-1',
        name: 'June broadcast',
        channels: ['IN_APP'],
        notificationTemplateId: tpl.header.id,
        targetType: 'SCHOOL',
      }),
    );
    expect(created.status).toBe('DRAFT');
    expect(created.code).toBe('CMP-E2E-1');

    // ----- Start campaign -------------------------------------------------
    const result = await withCtx(() =>
      campaignSvc.start(created.id, created.version),
    );

    expect(result.campaign.status).toBe('COMPLETED');
    expect(result.campaign.recipientCount).toBe(5);
    expect(result.campaign.sentCount).toBe(3);
    expect(result.summary.total).toBe(5);
    expect(result.summary.skipped).toBe(2);
    expect(result.summary.byReason.OPTED_OUT).toBe(1);
    expect(result.summary.byReason.QUIET_HOURS).toBe(1);

    // ----- Recipient rows: 5 total, 3 delivered, 2 skipped ---------------
    const recipients = h.state.campaignRecipients.filter(
      (r) => r.notificationCampaignId === created.id,
    );
    expect(recipients).toHaveLength(5);
    const delivered = recipients.filter((r) => !r.skipped);
    const skipped = recipients.filter((r) => r.skipped);
    expect(delivered).toHaveLength(3);
    expect(skipped).toHaveLength(2);
    expect(skipped.map((r) => r.skipReason).sort()).toEqual([
      'OPTED_OUT',
      'QUIET_HOURS',
    ]);

    // ----- Messages: 3 created, all DELIVERED (IN_APP) -------------------
    const messages = Object.values(h.state.messages).filter(
      (m) => m.campaignId === created.id,
    );
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m.channel).toBe('IN_APP');
      expect(m.status).toBe('DELIVERED');
      expect(m.deliveredAt).not.toBeNull();
    }

    // ----- Outbox fan-out -------------------------------------------------
    const topics = h.outboxTopics();
    expect(topics).toEqual(
      expect.arrayContaining([
        NotificationsOutboxTopics.TEMPLATE_CREATED,
        NotificationsOutboxTopics.CAMPAIGN_CREATED,
        NotificationsOutboxTopics.CAMPAIGN_STARTED,
        NotificationsOutboxTopics.MESSAGE_DELIVERED,
      ]),
    );
    expect(
      topics.filter((t) => t === NotificationsOutboxTopics.MESSAGE_DELIVERED),
    ).toHaveLength(3);
    expect(
      topics.filter((t) => t === NotificationsOutboxTopics.CAMPAIGN_STARTED),
    ).toHaveLength(1);

    // ----- Audit fan-out --------------------------------------------------
    const actions = h.auditActions();
    expect(actions).toEqual(
      expect.arrayContaining([
        'notification_campaign.create',
        'notification_campaign.start',
      ]),
    );

    // ----- Cancel a COMPLETED campaign → refused -------------------------
    await expect(
      withCtx(() => campaignSvc.cancel(created.id, result.campaign.version)),
    ).rejects.toBeInstanceOf(NotificationCampaignNotStartableError);
  });
});
