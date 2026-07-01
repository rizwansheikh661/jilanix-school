/**
 * Sprint 10 e2e helpers — shared in-memory store + stub factories
 * mirroring the Sprint 9 `makeHarness()` pattern.
 *
 * Why service-orchestration (no real DB) — see Sprint 9 fees specs:
 *   - Avoids spinning up a Testcontainers Postgres in CI for the e2e tier.
 *   - Locks tests to the public service contract (the same contract HTTP
 *     controllers + queue handlers consume), not Prisma internals.
 *
 * The harness wires:
 *   - `prisma`             — `{ client, transaction }` shape consumed by
 *                            every service in the module. Transactions
 *                            invoke the callback with a shared `tx` so
 *                            state mutations persist across boundaries.
 *   - `tx`                 — in-memory model proxies for
 *                            `notificationTemplate{,Version}`,
 *                            `notificationMessage{,Event}`,
 *                            `notificationUserPreference`,
 *                            `notificationCampaign{,Recipient}`,
 *                            `schoolCommunicationEntitlement`,
 *                            `user`. Each proxy supports the subset of
 *                            Prisma operators (`findFirst`, `findMany`,
 *                            `create`, `update`, `updateMany`, `count`,
 *                            `findUnique`) that the services actually call.
 *   - `templateRepo`       — a real-shape stub that delegates to the
 *                            in-memory store. Matches every method on
 *                            `NotificationTemplateRepository` consumed by
 *                            template/message/campaign services.
 *   - `messageRepo`        — same idea for `NotificationMessageRepository`.
 *   - `preferenceRepo`     — for `NotificationPreferenceRepository`.
 *   - `campaignRepo`       — for `NotificationCampaignRepository`.
 *   - `entitlementRepo`    — for `CommunicationEntitlementRepository`.
 *   - `featureFlags`       — accepts an `enabled` map (default
 *                            `module.notifications: true`); the
 *                            `isEnabled` resolves against that map.
 *   - `outbox`              — captures publish calls into an ordered array
 *                            exposed via `outboxTopics()`.
 *   - `audit`              — captures `record()` calls into an ordered
 *                            array exposed via `auditActions()`.
 *   - `eventRegistry`      — Sprint 10 catalog wrapper used by send-test
 *                            for the `registeredEvent` audit flag.
 *
 * The harness is intentionally chatty + small — each test file may opt
 * into the bits it needs (some skip `campaignRepo`, some never need
 * `entitlementRepo`). See `notifications.e2e-spec.ts`,
 * `notifications-quota.e2e-spec.ts`, `notifications-broadcast.e2e-spec.ts`
 * for usage examples.
 */
import { NotificationEventRegistry } from '../../src/core/notifications/notification-event.registry';

export interface SeedRoleResult {
  readonly id: string;
  readonly permissions: readonly string[];
}

/**
 * Tiny in-memory stand-in for the role + permissions seeder. Returns a
 * frozen `{id, permissions}` snapshot so each spec can assert the
 * seeded permission set explicitly without booting RbacService.
 */
export function seedRoleWithPermissions(
  id: string,
  permissions: readonly string[],
): SeedRoleResult {
  return Object.freeze({ id, permissions: Object.freeze([...permissions]) });
}

interface TemplateRow {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  description: string | null;
  channel: string;
  category: string;
  eventKey: string | null;
  defaultPriority: string;
  locale: string;
  audience: string;
  variablesSpec: unknown;
  isActive: boolean;
  activeVersionNo: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface VersionRow {
  id: string;
  schoolId: string;
  notificationTemplateId: string;
  versionNo: number;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  variablesSnapshot: unknown;
  createdAt: Date;
  createdBy: string | null;
}

interface MessageRow {
  id: string;
  schoolId: string;
  messageNo: string | null;
  recipientUserId: string;
  recipientAudience: string;
  recipientAddress: string;
  channel: string;
  category: string;
  priority: string;
  notificationTemplateId: string;
  templateVersionNo: number;
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  campaignId: string | null;
  subjectRendered: string | null;
  bodyRendered: string;
  dataPayload: unknown;
  deepLink: string | null;
  dedupeKey: string | null;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  providerCode: string | null;
  providerMessageId: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface MessageEventRow {
  id: string;
  schoolId: string;
  notificationMessageId: string;
  eventType: string;
  occurredAt: Date;
  createdBy: string | null;
}

interface PreferenceRow {
  id: string;
  schoolId: string;
  userId: string;
  channelEmail: boolean;
  channelSms: boolean;
  channelWhatsapp: boolean;
  channelInApp: boolean;
  categoryOptOuts: unknown;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string | null;
  locale: string;
  version: number;
}

interface CampaignRow {
  id: string;
  schoolId: string;
  code: string | null;
  name: string;
  description: string | null;
  channels: readonly string[];
  notificationTemplateId: string;
  targetType: string;
  targetId: string | null;
  audience: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

interface CampaignRecipientRow {
  id: string;
  schoolId: string;
  notificationCampaignId: string;
  recipientUserId: string;
  recipientAudience: string;
  notificationMessageId: string | null;
  resolutionReason: string | null;
  skipped: boolean;
  skipReason: string | null;
  createdAt: Date;
  createdBy: string | null;
}

interface EntitlementRow {
  id: string;
  schoolId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  inAppEnabled: boolean;
  emailMonthlyLimit: number | null;
  smsMonthlyLimit: number | null;
  whatsappMonthlyLimit: number | null;
  emailUsedThisPeriod: number;
  smsUsedThisPeriod: number;
  whatsappUsedThisPeriod: number;
  usagePeriodStart: Date;
  usagePeriodEnd: Date;
  isTrial: boolean;
  trialExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

interface UserRow {
  id: string;
  schoolId: string;
  status: string;
}

export interface NotificationsHarness {
  readonly prisma: unknown;
  readonly tx: unknown;
  readonly templateRepo: unknown;
  readonly messageRepo: unknown;
  readonly preferenceRepo: unknown;
  readonly campaignRepo: unknown;
  readonly entitlementRepo: unknown;
  readonly featureFlags: { isEnabled: jest.Mock };
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly eventRegistry: NotificationEventRegistry;
  outboxTopics(): string[];
  auditActions(): string[];
  state: {
    templates: Record<string, TemplateRow>;
    versions: VersionRow[];
    messages: Record<string, MessageRow>;
    messageEvents: MessageEventRow[];
    preferences: Record<string, PreferenceRow>;
    campaigns: Record<string, CampaignRow>;
    campaignRecipients: CampaignRecipientRow[];
    entitlements: Record<string, EntitlementRow>;
    users: UserRow[];
  };
}

export interface HarnessOpts {
  readonly schoolId: string;
  readonly now?: Date;
  readonly featureFlags?: Record<string, boolean>;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString().padStart(4, '0')}`;
}

export function createNotificationsHarness(opts: HarnessOpts): NotificationsHarness {
  const SCHOOL = opts.schoolId;
  const now = opts.now ?? new Date('2026-06-22T12:00:00.000Z');

  const state: NotificationsHarness['state'] = {
    templates: {},
    versions: [],
    messages: {},
    messageEvents: [],
    preferences: {},
    campaigns: {},
    campaignRecipients: [],
    entitlements: {},
    users: [],
  };

  // ---- Prisma tx proxies ---------------------------------------------------
  const tx = {
    notificationTemplate: {
      findFirst: jest.fn(async ({ where, select }: { where: { id?: string; schoolId?: string; deletedAt?: unknown; code?: string }; select?: Record<string, boolean> }) => {
        for (const row of Object.values(state.templates)) {
          if (where.id !== undefined && row.id !== where.id) continue;
          if (where.schoolId !== undefined && row.schoolId !== where.schoolId) continue;
          if (where.code !== undefined && row.code !== where.code) continue;
          if (row.deletedAt !== null) continue;
          if (select !== undefined) {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(select)) {
              out[k] = (row as unknown as Record<string, unknown>)[k];
            }
            return out;
          }
          return { ...row };
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { schoolId_id?: { schoolId: string; id: string }; id?: string } }) => {
        const id = where.schoolId_id?.id ?? where.id;
        const row = id !== undefined ? state.templates[id] : undefined;
        return row !== undefined ? { ...row } : null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('tpl');
        const row: TemplateRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          code: data.code as string,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          channel: data.channel as string,
          category: data.category as string,
          eventKey: (data.eventKey as string | null) ?? null,
          defaultPriority: (data.defaultPriority as string) ?? 'MEDIUM',
          locale: (data.locale as string) ?? 'en-IN',
          audience: (data.audience as string) ?? 'USER',
          variablesSpec: data.variablesSpec ?? null,
          isActive: (data.isActive as boolean) ?? true,
          activeVersionNo: (data.activeVersionNo as number) ?? 1,
          createdAt: now,
          updatedAt: now,
          createdBy: (data.createdBy as string | null) ?? null,
          updatedBy: (data.updatedBy as string | null) ?? null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        state.templates[id] = row;
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; schoolId: string; version: number; deletedAt: unknown }; data: Record<string, unknown> }) => {
        const row = state.templates[where.id];
        if (row === undefined || row.schoolId !== where.schoolId || row.version !== where.version || row.deletedAt !== null) {
          return { count: 0 };
        }
        const next: TemplateRow = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
            next.version = row.version + ((v as { increment: number }).increment ?? 1);
          } else {
            (next as unknown as Record<string, unknown>)[k] = v;
          }
        }
        next.updatedAt = now;
        state.templates[where.id] = next;
        return { count: 1 };
      }),
      count: jest.fn(async () => 0),
    },
    notificationTemplateVersion: {
      findFirst: jest.fn(async ({ where }: { where: { schoolId: string; notificationTemplateId: string; versionNo?: number } }) => {
        for (const v of state.versions) {
          if (v.schoolId !== where.schoolId) continue;
          if (v.notificationTemplateId !== where.notificationTemplateId) continue;
          if (where.versionNo !== undefined && v.versionNo !== where.versionNo) continue;
          return { ...v };
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: { where: { schoolId: string; notificationTemplateId: string } }) => {
        return state.versions
          .filter((v) => v.schoolId === where.schoolId && v.notificationTemplateId === where.notificationTemplateId)
          .sort((a, b) => a.versionNo - b.versionNo)
          .map((v) => ({ ...v }));
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('tv');
        const row: VersionRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          notificationTemplateId: data.notificationTemplateId as string,
          versionNo: data.versionNo as number,
          subject: (data.subject as string | null) ?? null,
          bodyText: data.bodyText as string,
          bodyHtml: (data.bodyHtml as string | null) ?? null,
          variablesSnapshot: data.variablesSnapshot ?? null,
          createdAt: now,
          createdBy: (data.createdBy as string | null) ?? null,
        };
        state.versions.push(row);
        return { ...row };
      }),
    },
    notificationMessage: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of Object.values(state.messages)) {
          if (!matchWhere(row as unknown as Record<string, unknown>, where)) continue;
          return { ...row };
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { schoolId_id?: { schoolId: string; id: string }; id?: string } }) => {
        const id = where.schoolId_id?.id ?? where.id;
        const row = id !== undefined ? state.messages[id] : undefined;
        return row !== undefined ? { ...row } : null;
      }),
      findMany: jest.fn(async ({ where, orderBy: _orderBy, take }: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
        const matched: MessageRow[] = [];
        for (const row of Object.values(state.messages)) {
          if (matchWhere(row as unknown as Record<string, unknown>, where)) matched.push(row);
        }
        // Order by createdAt desc, id desc (the inbox + dispatcher pattern).
        matched.sort((a, b) => {
          const t = b.createdAt.getTime() - a.createdAt.getTime();
          if (t !== 0) return t;
          return b.id.localeCompare(a.id);
        });
        const slice = take !== undefined ? matched.slice(0, take) : matched;
        return slice.map((m) => ({ ...m }));
      }),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let n = 0;
        for (const row of Object.values(state.messages)) {
          if (matchWhere(row as unknown as Record<string, unknown>, where)) n += 1;
        }
        return n;
      }),
      create: jest.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const id = nextId('msg');
        const row: MessageRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          messageNo: (data.messageNo as string | null) ?? null,
          recipientUserId: data.recipientUserId as string,
          recipientAudience: (data.recipientAudience as string) ?? 'USER',
          recipientAddress: (data.recipientAddress as string) ?? '',
          channel: data.channel as string,
          category: data.category as string,
          priority: data.priority as string,
          notificationTemplateId: data.notificationTemplateId as string,
          templateVersionNo: data.templateVersionNo as number,
          eventKey: (data.eventKey as string) ?? 'TEST',
          aggregateType: (data.aggregateType as string) ?? 'TestSend',
          aggregateId: (data.aggregateId as string) ?? '',
          campaignId: (data.campaignId as string | null) ?? null,
          subjectRendered: (data.subjectRendered as string | null) ?? null,
          bodyRendered: data.bodyRendered as string,
          dataPayload: data.dataPayload ?? {},
          deepLink: (data.deepLink as string | null) ?? null,
          dedupeKey: (data.dedupeKey as string | null) ?? null,
          status: (data.status as string) ?? 'QUEUED',
          scheduledAt: (data.scheduledAt as Date | null) ?? null,
          sentAt: (data.sentAt as Date | null) ?? null,
          deliveredAt: (data.deliveredAt as Date | null) ?? null,
          readAt: null,
          failedAt: null,
          lastError: null,
          providerCode: null,
          providerMessageId: null,
          attemptCount: (data.attemptCount as number) ?? 0,
          maxAttempts: (data.maxAttempts as number) ?? 5,
          createdAt: now,
          updatedAt: now,
          createdBy: (data.createdBy as string | null) ?? null,
          updatedBy: (data.updatedBy as string | null) ?? null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        state.messages[id] = row;
        if (select !== undefined) {
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(select)) {
            out[k] = (row as unknown as Record<string, unknown>)[k];
          }
          return out;
        }
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: { where: { schoolId_id?: { schoolId: string; id: string }; id?: string }; data: Record<string, unknown> }) => {
        const id = where.schoolId_id?.id ?? where.id;
        if (id === undefined) throw new Error('update: missing id');
        const row = state.messages[id];
        if (row === undefined) throw new Error(`update: missing message ${id}`);
        const next: MessageRow = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
            next.version = row.version + ((v as { increment: number }).increment ?? 1);
          } else {
            (next as unknown as Record<string, unknown>)[k] = v;
          }
        }
        next.updatedAt = now;
        state.messages[id] = next;
        return { ...next };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of Object.values(state.messages)) {
          if (!matchWhere(row as unknown as Record<string, unknown>, where)) continue;
          const next: MessageRow = { ...row };
          for (const [k, v] of Object.entries(data)) {
            if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
              next.version = row.version + ((v as { increment: number }).increment ?? 1);
            } else {
              (next as unknown as Record<string, unknown>)[k] = v;
            }
          }
          next.updatedAt = now;
          state.messages[row.id] = next;
          count += 1;
        }
        return { count };
      }),
    },
    notificationMessageEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('ev');
        const row: MessageEventRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          notificationMessageId: data.notificationMessageId as string,
          eventType: data.eventType as string,
          occurredAt: (data.occurredAt as Date) ?? now,
          createdBy: (data.createdBy as string | null) ?? null,
        };
        state.messageEvents.push(row);
        return { ...row };
      }),
    },
    notificationUserPreference: {
      findFirst: jest.fn(async ({ where }: { where: { schoolId: string; userId: string } }) => {
        const row = state.preferences[`${where.schoolId}:${where.userId}`];
        return row !== undefined ? { ...row } : null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('pref');
        const row: PreferenceRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          userId: data.userId as string,
          channelEmail: (data.channelEmail as boolean) ?? true,
          channelSms: (data.channelSms as boolean) ?? true,
          channelWhatsapp: (data.channelWhatsapp as boolean) ?? true,
          channelInApp: (data.channelInApp as boolean) ?? true,
          categoryOptOuts: data.categoryOptOuts ?? null,
          quietHoursStart: (data.quietHoursStart as string | null) ?? '21:00',
          quietHoursEnd: (data.quietHoursEnd as string | null) ?? '07:00',
          quietHoursTimezone: (data.quietHoursTimezone as string | null) ?? 'Asia/Kolkata',
          locale: (data.locale as string) ?? 'en-IN',
          version: 1,
        };
        state.preferences[`${row.schoolId}:${row.userId}`] = row;
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: { where: { id?: string; schoolId_id?: { id: string } }; data: Record<string, unknown> }) => {
        const id = where.id ?? where.schoolId_id?.id;
        const row = Object.values(state.preferences).find((p) => p.id === id);
        if (row === undefined) throw new Error(`pref update: ${id} not found`);
        Object.assign(row, data);
        return { ...row };
      }),
    },
    notificationCampaign: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of Object.values(state.campaigns)) {
          if (!matchWhere(row as unknown as Record<string, unknown>, where)) continue;
          return { ...row };
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('cmp');
        const row: CampaignRow = {
          id,
          schoolId: (data.schoolId as string) ?? SCHOOL,
          code: (data.code as string | null) ?? null,
          name: data.name as string,
          description: (data.description as string | null) ?? null,
          channels: (data.channels as readonly string[]) ?? [],
          notificationTemplateId: data.notificationTemplateId as string,
          targetType: data.targetType as string,
          targetId: (data.targetId as string | null) ?? null,
          audience: (data.audience as string) ?? 'USER',
          status: (data.status as string) ?? 'DRAFT',
          scheduledAt: (data.scheduledAt as Date | null) ?? null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          recipientCount: 0,
          sentCount: 0,
          failedCount: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: (data.createdBy as string | null) ?? null,
          updatedBy: (data.updatedBy as string | null) ?? null,
          deletedAt: null,
          deletedBy: null,
          version: 1,
        };
        state.campaigns[id] = row;
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; schoolId: string; version: number; deletedAt: unknown }; data: Record<string, unknown> }) => {
        const row = state.campaigns[where.id];
        if (row === undefined || row.schoolId !== where.schoolId || row.version !== where.version) {
          return { count: 0 };
        }
        const next: CampaignRow = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
            next.version = row.version + ((v as { increment: number }).increment ?? 1);
          } else {
            (next as unknown as Record<string, unknown>)[k] = v;
          }
        }
        next.updatedAt = now;
        state.campaigns[where.id] = next;
        return { count: 1 };
      }),
      count: jest.fn(async () => 0),
    },
    notificationCampaignRecipient: {
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const r of data) {
          state.campaignRecipients.push({
            id: nextId('rcp'),
            schoolId: (r.schoolId as string) ?? SCHOOL,
            notificationCampaignId: r.notificationCampaignId as string,
            recipientUserId: r.recipientUserId as string,
            recipientAudience: (r.recipientAudience as string) ?? 'USER',
            notificationMessageId: (r.notificationMessageId as string | null) ?? null,
            resolutionReason: (r.resolutionReason as string | null) ?? null,
            skipped: (r.skipped as boolean) ?? false,
            skipReason: (r.skipReason as string | null) ?? null,
            createdAt: now,
            createdBy: (r.createdBy as string | null) ?? null,
          });
        }
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: { where: { schoolId: string; notificationCampaignId: string } }) => {
        return state.campaignRecipients.filter(
          (r) => r.schoolId === where.schoolId && r.notificationCampaignId === where.notificationCampaignId,
        );
      }),
      groupBy: jest.fn(async () => []),
      count: jest.fn(async ({ where }: { where: { schoolId: string; notificationCampaignId: string; skipped?: boolean } }) => {
        return state.campaignRecipients.filter((r) => {
          if (r.schoolId !== where.schoolId) return false;
          if (r.notificationCampaignId !== where.notificationCampaignId) return false;
          if (where.skipped !== undefined && r.skipped !== where.skipped) return false;
          return true;
        }).length;
      }),
    },
    schoolCommunicationEntitlement: {
      findFirst: jest.fn(async ({ where }: { where: { schoolId?: string; id?: string } }) => {
        for (const row of Object.values(state.entitlements)) {
          if (where.schoolId !== undefined && row.schoolId !== where.schoolId) continue;
          if (where.id !== undefined && row.id !== where.id) continue;
          return { ...row };
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id?: string; schoolId?: string } }) => {
        for (const row of Object.values(state.entitlements)) {
          if (where.id !== undefined && row.id !== where.id) continue;
          if (where.schoolId !== undefined && row.schoolId !== where.schoolId) continue;
          return { ...row };
        }
        return null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = nextId('ent');
        const row: EntitlementRow = {
          id,
          schoolId: data.schoolId as string,
          emailEnabled: (data.emailEnabled as boolean) ?? true,
          smsEnabled: (data.smsEnabled as boolean) ?? false,
          whatsappEnabled: (data.whatsappEnabled as boolean) ?? false,
          inAppEnabled: (data.inAppEnabled as boolean) ?? true,
          emailMonthlyLimit: (data.emailMonthlyLimit as number | null) ?? null,
          smsMonthlyLimit: (data.smsMonthlyLimit as number | null) ?? null,
          whatsappMonthlyLimit: (data.whatsappMonthlyLimit as number | null) ?? null,
          emailUsedThisPeriod: 0,
          smsUsedThisPeriod: 0,
          whatsappUsedThisPeriod: 0,
          usagePeriodStart: (data.usagePeriodStart as Date) ?? now,
          usagePeriodEnd: (data.usagePeriodEnd as Date) ?? now,
          isTrial: (data.isTrial as boolean) ?? false,
          trialExpiresAt: (data.trialExpiresAt as Date | null) ?? null,
          createdAt: now,
          updatedAt: now,
          createdBy: (data.createdBy as string | null) ?? null,
          updatedBy: null,
          version: 1,
        };
        state.entitlements[id] = row;
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; schoolId: string; version: number }; data: Record<string, unknown> }) => {
        const row = state.entitlements[where.id];
        if (row === undefined || row.schoolId !== where.schoolId || row.version !== where.version) {
          return { count: 0 };
        }
        const next: EntitlementRow = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
            next.version = row.version + ((v as { increment: number }).increment ?? 1);
          } else {
            (next as unknown as Record<string, unknown>)[k] = v;
          }
        }
        next.updatedAt = now;
        state.entitlements[where.id] = next;
        return { count: 1 };
      }),
    },
    user: {
      findMany: jest.fn(async ({ where, take }: { where: { schoolId: string; status?: string }; orderBy?: unknown; take?: number }) => {
        const matched = state.users.filter((u) => {
          if (u.schoolId !== where.schoolId) return false;
          if (where.status !== undefined && u.status !== where.status) return false;
          return true;
        });
        matched.sort((a, b) => a.id.localeCompare(b.id));
        const slice = take !== undefined ? matched.slice(0, take) : matched;
        return slice.map((u) => ({ id: u.id }));
      }),
    },
  };

  const prisma = {
    get client() {
      return tx;
    },
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  // ---- Outbox + audit accumulators ----------------------------------------
  const outboxCalls: Array<{ topic: string; eventType: string; payload: unknown }> = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, payload: { topic: string; eventType: string; payload: unknown }) => {
      outboxCalls.push({ topic: payload.topic, eventType: payload.eventType, payload: payload.payload });
    }),
  };
  const auditCalls: Array<{ action: string; category: string }> = [];
  const audit = {
    record: jest.fn(async (input: { action: string; category: string }) => {
      auditCalls.push({ action: input.action, category: input.category });
      return { id: nextId('audit'), rowHash: 'h' };
    }),
  };

  // ---- Feature flags -------------------------------------------------------
  const flagsMap: Record<string, boolean> = {
    'module.notifications': true,
    ...(opts.featureFlags ?? {}),
  };
  const featureFlags = {
    isEnabled: jest.fn(async (flag: string) => flagsMap[flag] ?? false),
  };

  // ---- Repository stubs ----------------------------------------------------
  // Template repo — delegates to the in-memory store via the tx proxy.
  const templateRepo = {
    findById: jest.fn(async (txArg: unknown, schoolId: string, id: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplate.findFirst({
        where: { schoolId, id, deletedAt: null },
      });
    }),
    findByCode: jest.fn(async (txArg: unknown, schoolId: string, code: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplate.findFirst({
        where: { schoolId, code, deletedAt: null },
      });
    }),
    list: jest.fn(async () => ({ rows: Object.values(state.templates), nextCursor: null })),
    create: jest.fn(async (txArg: unknown, schoolId: string, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplate.create({
        data: { ...data, schoolId, isActive: true, activeVersionNo: 1 },
      });
    }),
    update: jest.fn(async (txArg: unknown, schoolId: string, id: string, expectedVersion: number, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      const result = await t.notificationTemplate.updateMany({
        where: { schoolId, id, version: expectedVersion, deletedAt: null },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        // Surface the same VersionConflict shape the repo would.
        const { VersionConflict } = await import('../../src/core/errors/domain-error');
        throw new VersionConflict('NotificationTemplate', id, expectedVersion);
      }
      const reloaded = state.templates[id];
      if (reloaded === undefined) throw new Error('template missing after update');
      return { ...reloaded };
    }),
    softDelete: jest.fn(async (txArg: unknown, schoolId: string, id: string, expectedVersion: number, deletedBy: string | null) => {
      const t = (txArg ?? tx) as typeof tx;
      const result = await t.notificationTemplate.updateMany({
        where: { schoolId, id, version: expectedVersion, deletedAt: null },
        data: { deletedAt: now, deletedBy, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const { VersionConflict } = await import('../../src/core/errors/domain-error');
        throw new VersionConflict('NotificationTemplate', id, expectedVersion);
      }
    }),
    findActiveVersion: jest.fn(async (txArg: unknown, schoolId: string, templateId: string) => {
      const header = state.templates[templateId];
      if (header === undefined || header.deletedAt !== null) return null;
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplateVersion.findFirst({
        where: { schoolId, notificationTemplateId: templateId, versionNo: header.activeVersionNo },
      });
    }),
    listVersions: jest.fn(async (txArg: unknown, schoolId: string, templateId: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplateVersion.findMany({
        where: { schoolId, notificationTemplateId: templateId },
      });
    }),
    appendVersion: jest.fn(async (txArg: unknown, schoolId: string, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationTemplateVersion.create({ data: { ...data, schoolId } });
    }),
    countQueuedMessagesByTemplate: jest.fn(async () => 0),
    countActiveCampaignsByTemplate: jest.fn(async () => 0),
  };

  // Message repo — same delegation pattern.
  const messageRepo = {
    findById: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      id: string,
      opts?: { includeEvents?: boolean },
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      const row = await t.notificationMessage.findFirst({
        where: { schoolId, id, deletedAt: null },
      });
      if (row === null) return null;
      if (opts?.includeEvents === true) {
        const events = state.messageEvents.filter((e) => e.notificationMessageId === id);
        return { ...row, events };
      }
      return row;
    }),
    list: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      _filters: { limit?: number; cursor?: string },
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      const rows = await t.notificationMessage.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return { rows, nextCursor: null };
    }),
    updateStatus: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      id: string,
      _expectedVersion: number,
      data: { status: string; updatedBy: string | null },
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationMessage.update({
        where: { schoolId_id: { schoolId, id } },
        data: { status: data.status, updatedBy: data.updatedBy, version: { increment: 1 } },
      });
    }),
    appendEvent: jest.fn(async (txArg: unknown, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationMessageEvent.create({ data });
    }),
  };

  // Preference repo
  const preferenceRepo = {
    findByUser: jest.fn(async (txArg: unknown, schoolId: string, userId: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationUserPreference.findFirst({ where: { schoolId, userId } });
    }),
    create: jest.fn(async (txArg: unknown, schoolId: string, _userId: string, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationUserPreference.create({ data: { ...data, schoolId } });
    }),
    update: jest.fn(async (
      txArg: unknown,
      _schoolId: string,
      id: string,
      _expectedVersion: number,
      _userId: string,
      data: Record<string, unknown>,
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationUserPreference.update({ where: { id }, data });
    }),
  };

  // Campaign repo
  const campaignRepo = {
    list: jest.fn(async () => ({ rows: Object.values(state.campaigns), nextCursor: null })),
    findById: jest.fn(async (txArg: unknown, schoolId: string, id: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationCampaign.findFirst({ where: { schoolId, id, deletedAt: null } });
    }),
    create: jest.fn(async (txArg: unknown, schoolId: string, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.notificationCampaign.create({ data: { ...data, schoolId } });
    }),
    update: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      id: string,
      expectedVersion: number,
      data: Record<string, unknown>,
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      const result = await t.notificationCampaign.updateMany({
        where: { schoolId, id, version: expectedVersion, deletedAt: null },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const { VersionConflict } = await import('../../src/core/errors/domain-error');
        throw new VersionConflict('NotificationCampaign', id, expectedVersion);
      }
      const reloaded = state.campaigns[id];
      if (reloaded === undefined) throw new Error('campaign missing after update');
      return { ...reloaded };
    }),
    appendRecipients: jest.fn(async (txArg: unknown, rows: Array<Record<string, unknown>>) => {
      const t = (txArg ?? tx) as typeof tx;
      const out = await t.notificationCampaignRecipient.createMany({ data: rows });
      return out.count;
    }),
    listRecipients: jest.fn(async (txArg: unknown, schoolId: string, id: string) => {
      const t = (txArg ?? tx) as typeof tx;
      const rows = await t.notificationCampaignRecipient.findMany({
        where: { schoolId, notificationCampaignId: id },
      });
      return { rows, nextCursor: null };
    }),
    recipientSummary: jest.fn(async (_txArg: unknown, schoolId: string, id: string) => {
      const rows = state.campaignRecipients.filter(
        (r) => r.schoolId === schoolId && r.notificationCampaignId === id,
      );
      const skipped = rows.filter((r) => r.skipped);
      const byReason: Record<string, number> = {
        OPTED_OUT: 0,
        QUIET_HOURS: 0,
        QUOTA_EXHAUSTED: 0,
        CHANNEL_DISABLED: 0,
      };
      for (const s of skipped) {
        if (s.skipReason !== null) {
          byReason[s.skipReason] = (byReason[s.skipReason] ?? 0) + 1;
        }
      }
      return { total: rows.length, skipped: skipped.length, byReason };
    }),
  };

  // Entitlement repo
  const entitlementRepo = {
    findBySchool: jest.fn(async (txArg: unknown, schoolId: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.schoolCommunicationEntitlement.findFirst({ where: { schoolId } });
    }),
    findByIdForAdmin: jest.fn(async (txArg: unknown, schoolId: string) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.schoolCommunicationEntitlement.findFirst({ where: { schoolId } });
    }),
    list: jest.fn(async () => ({ items: Object.values(state.entitlements), nextCursor: null })),
    create: jest.fn(async (txArg: unknown, data: Record<string, unknown>) => {
      const t = (txArg ?? tx) as typeof tx;
      return t.schoolCommunicationEntitlement.create({ data });
    }),
    update: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      id: string,
      expectedVersion: number,
      data: Record<string, unknown>,
    ) => {
      const t = (txArg ?? tx) as typeof tx;
      const result = await t.schoolCommunicationEntitlement.updateMany({
        where: { id, schoolId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const { VersionConflict } = await import('../../src/core/errors/domain-error');
        throw new VersionConflict('SchoolCommunicationEntitlement', id, expectedVersion);
      }
      const reloaded = state.entitlements[id];
      if (reloaded === undefined) throw new Error('entitlement missing after update');
      return { ...reloaded };
    }),
    incrementUsage: jest.fn(async (
      txArg: unknown,
      schoolId: string,
      id: string,
      channel: 'EMAIL' | 'SMS' | 'WHATSAPP',
    ) => {
      const row = state.entitlements[id];
      if (row === undefined || row.schoolId !== schoolId) {
        throw new Error('entitlement missing for increment');
      }
      const next: EntitlementRow = { ...row };
      const t = (txArg ?? tx) as typeof tx;
      const counterKey =
        channel === 'EMAIL'
          ? 'emailUsedThisPeriod'
          : channel === 'SMS'
            ? 'smsUsedThisPeriod'
            : 'whatsappUsedThisPeriod';
      (next as unknown as Record<string, number>)[counterKey] =
        (row as unknown as Record<string, number>)[counterKey]! + 1;
      next.version = row.version + 1;
      state.entitlements[id] = next;
      // Touch updatedAt via the proxy so audit logs see consistent stamps.
      void t;
      return { ...next };
    }),
    resetUsage: jest.fn(async (
      _txArg: unknown,
      _schoolId: string,
      id: string,
      _expectedVersion: number,
      periodStart: Date,
      periodEnd: Date,
    ) => {
      const row = state.entitlements[id];
      if (row === undefined) throw new Error('entitlement missing for reset');
      const next: EntitlementRow = {
        ...row,
        emailUsedThisPeriod: 0,
        smsUsedThisPeriod: 0,
        whatsappUsedThisPeriod: 0,
        usagePeriodStart: periodStart,
        usagePeriodEnd: periodEnd,
        version: row.version + 1,
      };
      state.entitlements[id] = next;
      return { ...next };
    }),
  };

  return {
    prisma,
    tx,
    templateRepo,
    messageRepo,
    preferenceRepo,
    campaignRepo,
    entitlementRepo,
    featureFlags,
    outbox,
    audit,
    eventRegistry: new NotificationEventRegistry(),
    outboxTopics(): string[] {
      return outboxCalls.map((c) => c.topic);
    },
    auditActions(): string[] {
      return auditCalls.map((c) => c.action);
    },
    state,
  };
}

/**
 * Minimal where-clause matcher: equality on top-level keys plus the
 * Prisma operators the services actually use (`{ in: [...] }` and
 * `null` for "is null"). Anything richer is over-engineering for the
 * subset of queries these specs exercise.
 */
function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    const actual = row[key];
    if (expected === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }
    if (typeof expected === 'object' && expected !== null) {
      if ('in' in expected && Array.isArray((expected as { in: unknown[] }).in)) {
        if (!(expected as { in: unknown[] }).in.includes(actual)) return false;
        continue;
      }
      // Unknown operator → require exact equality (defensive fallback).
      if (actual !== expected) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}
