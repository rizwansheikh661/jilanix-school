/**
 * NotificationTemplateService unit specs — header + version CRUD, duplicate-
 * code guard, in-use delete guard, activate/deactivate, and listVersions
 * ordering.
 *
 * Persistence + cross-cutting deps are fully mocked. Mirrors the manual-mock
 * shape used by `FeeHeadService.spec`.
 */
import { RequestContextRegistry } from '../../request-context';
import { NotificationsOutboxTopics } from '../notifications.constants';
import {
  DuplicateNotificationTemplateCodeError,
  NotificationTemplateInUseError,
} from '../notifications.errors';
import type {
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import { NotificationTemplateService } from './notification-template.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeHeader(
  overrides: Partial<NotificationTemplateRow> = {},
): NotificationTemplateRow {
  return {
    id: 'nt-1',
    schoolId: SCHOOL,
    code: 'WELCOME',
    name: 'Welcome',
    description: null,
    channel: 'IN_APP',
    category: 'SYSTEM',
    eventKey: null,
    defaultPriority: 'MEDIUM',
    locale: 'en-IN',
    audience: 'USER',
    variablesSpec: null,
    isActive: true,
    activeVersionNo: 1,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...overrides,
  } as unknown as NotificationTemplateRow;
}

function makeVersion(
  overrides: Partial<NotificationTemplateVersionRow> = {},
): NotificationTemplateVersionRow {
  return {
    id: 'ntv-1',
    schoolId: SCHOOL,
    notificationTemplateId: 'nt-1',
    versionNo: 1,
    subject: null,
    bodyText: 'Hello',
    bodyHtml: null,
    variablesSnapshot: null,
    createdAt: NOW,
    createdBy: null,
    ...overrides,
  } as unknown as NotificationTemplateVersionRow;
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    findActiveVersion: jest.fn(),
    listVersions: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    appendVersion: jest.fn(),
    countQueuedMessagesByTemplate: jest.fn(async () => 0),
    countActiveCampaignsByTemplate: jest.fn(async () => 0),
  };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new NotificationTemplateService(
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
    userId: 'user-1',
    actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('NotificationTemplateService.create', () => {
  it('creates header + initial version 1 and publishes template.created', async () => {
    const t = makeService();
    t.repo.findByCode.mockResolvedValue(null);
    const header = makeHeader({ id: 'nt-new', code: 'WELCOME', activeVersionNo: 1 });
    const version = makeVersion({ notificationTemplateId: 'nt-new', versionNo: 1 });
    t.repo.create.mockResolvedValue(header);
    t.repo.appendVersion.mockResolvedValue(version);

    const result = await withCtx(() =>
      t.svc.create({
        code: 'WELCOME',
        name: 'Welcome',
        channel: 'IN_APP',
        category: 'SYSTEM',
        bodyText: 'Hello {{name}}',
      }),
    );

    expect(result.header.id).toBe('nt-new');
    expect(result.activeVersion?.versionNo).toBe(1);
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    expect(t.repo.appendVersion).toHaveBeenCalledTimes(1);
    const appendArgs = (t.repo.appendVersion.mock.calls as unknown as Array<
      [unknown, string, { versionNo: number; bodyText: string }]
    >)[0]!;
    expect(appendArgs[2].versionNo).toBe(1);
    expect(appendArgs[2].bodyText).toBe('Hello {{name}}');

    expect(
      (t.outbox.publish.mock.calls as unknown as Array<
        [unknown, { topic: string; eventType: string }]
      >)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.TEMPLATE_CREATED,
        eventType: 'NotificationTemplateCreated',
      }),
    );
    expect(t.audit.record).toHaveBeenCalledTimes(1);
    expect(
      (t.audit.record.mock.calls as unknown as Array<
        [{ action: string; category: string; resourceType: string }]
      >)[0]![0],
    ).toEqual(
      expect.objectContaining({
        action: 'notification_template.create',
        category: 'general',
        resourceType: 'NotificationTemplate',
      }),
    );
  });

  it('rejects duplicate code with DuplicateNotificationTemplateCodeError', async () => {
    const t = makeService();
    t.repo.findByCode.mockResolvedValue(makeHeader({ code: 'WELCOME' }));
    await expect(
      withCtx(() =>
        t.svc.create({
          code: 'WELCOME',
          name: 'Welcome',
          channel: 'IN_APP',
          category: 'SYSTEM',
          bodyText: 'Hello',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateNotificationTemplateCodeError);
    expect(t.repo.create).not.toHaveBeenCalled();
    expect(t.repo.appendVersion).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });
});

describe('NotificationTemplateService.update', () => {
  it('header-only update bumps version and does not touch versions table', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader({ version: 1 }));
    t.repo.update.mockResolvedValue(
      makeHeader({ version: 2, name: 'Renamed', category: 'ACADEMIC', eventKey: 'USER_WELCOMED' }),
    );

    const result = await withCtx(() =>
      t.svc.update('nt-1', 1, {
        name: 'Renamed',
        category: 'ACADEMIC',
        eventKey: 'USER_WELCOMED',
      }),
    );

    expect(result.version).toBe(2);
    expect(result.name).toBe('Renamed');
    expect(t.repo.appendVersion).not.toHaveBeenCalled();
    expect(t.repo.update).toHaveBeenCalledTimes(1);
    const updateArgs = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, Record<string, unknown>]
    >)[0]!;
    expect(updateArgs[3]).toBe(1);
    expect(updateArgs[4]).toEqual(
      expect.objectContaining({
        name: 'Renamed',
        category: 'ACADEMIC',
        eventKey: 'USER_WELCOMED',
      }),
    );
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1],
    ).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.TEMPLATE_UPDATED }),
    );
  });
});

describe('NotificationTemplateService.appendVersion', () => {
  it('bumps activeVersionNo and inserts a new immutable version row', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader({ activeVersionNo: 1, version: 3 }));
    const newVersion = makeVersion({ id: 'ntv-2', versionNo: 2, bodyText: 'v2' });
    t.repo.appendVersion.mockResolvedValue(newVersion);
    const updatedHeader = makeHeader({ activeVersionNo: 2, version: 4 });
    t.repo.update.mockResolvedValue(updatedHeader);

    const result = await withCtx(() =>
      t.svc.appendVersion('nt-1', 3, { bodyText: 'v2' }),
    );

    expect(result.version.versionNo).toBe(2);
    expect(result.header.activeVersionNo).toBe(2);

    expect(t.repo.appendVersion).toHaveBeenCalledTimes(1);
    const appendArgs = (t.repo.appendVersion.mock.calls as unknown as Array<
      [unknown, string, { versionNo: number; bodyText: string }]
    >)[0]!;
    expect(appendArgs[2].versionNo).toBe(2);

    const updateArgs = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, { activeVersionNo?: number }]
    >)[0]!;
    expect(updateArgs[4].activeVersionNo).toBe(2);

    expect(
      (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.TEMPLATE_VERSION_CREATED,
      }),
    );
  });
});

describe('NotificationTemplateService.delete', () => {
  it('refuses when queued messages exist (NotificationTemplateInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader());
    t.repo.countQueuedMessagesByTemplate.mockResolvedValue(3);
    t.repo.countActiveCampaignsByTemplate.mockResolvedValue(0);
    await expect(withCtx(() => t.svc.delete('nt-1', 1))).rejects.toBeInstanceOf(
      NotificationTemplateInUseError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
    expect(t.outbox.publish).not.toHaveBeenCalled();
  });

  it('refuses when active campaigns exist (NotificationTemplateInUseError)', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader());
    t.repo.countQueuedMessagesByTemplate.mockResolvedValue(0);
    t.repo.countActiveCampaignsByTemplate.mockResolvedValue(1);
    await expect(withCtx(() => t.svc.delete('nt-1', 1))).rejects.toBeInstanceOf(
      NotificationTemplateInUseError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes when no refs and publishes template.deleted', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader());
    t.repo.countQueuedMessagesByTemplate.mockResolvedValue(0);
    t.repo.countActiveCampaignsByTemplate.mockResolvedValue(0);
    t.repo.softDelete.mockResolvedValue(undefined);
    await withCtx(() => t.svc.delete('nt-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledTimes(1);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1],
    ).toEqual(
      expect.objectContaining({ topic: NotificationsOutboxTopics.TEMPLATE_DELETED }),
    );
  });
});

describe('NotificationTemplateService.activate / deactivate', () => {
  it('activate flips isActive=true and publishes template.activated', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader({ isActive: false, version: 2 }));
    t.repo.update.mockResolvedValue(makeHeader({ isActive: true, version: 3 }));
    const out = await withCtx(() => t.svc.activate('nt-1', 2));
    expect(out.isActive).toBe(true);
    expect(out.version).toBe(3);
    const patch = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, { isActive?: boolean }]
    >)[0]![4];
    expect(patch.isActive).toBe(true);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.TEMPLATE_ACTIVATED,
      }),
    );
  });

  it('deactivate flips isActive=false and publishes template.deactivated', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader({ isActive: true, version: 2 }));
    t.repo.update.mockResolvedValue(makeHeader({ isActive: false, version: 3 }));
    const out = await withCtx(() => t.svc.deactivate('nt-1', 2));
    expect(out.isActive).toBe(false);
    const patch = (t.repo.update.mock.calls as unknown as Array<
      [unknown, string, string, number, { isActive?: boolean }]
    >)[0]![4];
    expect(patch.isActive).toBe(false);
    expect(
      (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>)[0]![1],
    ).toEqual(
      expect.objectContaining({
        topic: NotificationsOutboxTopics.TEMPLATE_DEACTIVATED,
      }),
    );
  });
});

describe('NotificationTemplateService.listVersions', () => {
  it('returns versions ordered oldest-first', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeHeader());
    const ordered = [
      makeVersion({ id: 'v1', versionNo: 1 }),
      makeVersion({ id: 'v2', versionNo: 2 }),
      makeVersion({ id: 'v3', versionNo: 3 }),
    ];
    t.repo.listVersions.mockResolvedValue(ordered);

    const out = await withCtx(() => t.svc.listVersions('nt-1'));

    expect(out.map((v) => v.versionNo)).toEqual([1, 2, 3]);
    expect(t.repo.listVersions).toHaveBeenCalledWith(undefined, SCHOOL, 'nt-1');
  });
});
