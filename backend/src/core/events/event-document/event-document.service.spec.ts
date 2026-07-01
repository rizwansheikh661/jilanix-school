/**
 * EventDocumentService unit specs — upload flow (asset → row), delete flow
 * (row → asset cleanup), orphan cleanup on row insert failure.
 */
import { RequestContextRegistry } from '../../request-context';
import { EventsOutboxTopics } from '../events.constants';
import {
  EventDocumentNotFoundError,
  EventNotFoundError,
} from '../events.errors';
import type { EventDocumentRow, EventRow } from '../events.types';
import { EventDocumentService } from './event-document.service';

const SCHOOL = 'school-1';
const NOW = new Date('2026-06-22T00:00:00.000Z');

function makeEvent(): EventRow {
  return {
    id: 'evt-1', schoolId: SCHOOL, code: 'EVT-000001', name: 'Annual Day',
    description: null, eventType: 'CULTURAL', category: 'CULTURAL', subType: null,
    status: 'PUBLISHED', startDate: new Date('2026-07-15'), endDate: new Date('2026-07-15'),
    startTime: null, endTime: null, timezone: 'Asia/Kolkata',
    branchId: null, venue: null, organizerStaffId: null,
    registrationType: 'OPEN', registrationOpen: false,
    registrationOpenAt: null, registrationClosedAt: null, registrationCapacity: null,
    isFree: true, feeHeadId: null, feeStructureId: null, feeAmount: null,
    estimatedCost: null, actualCost: null, sponsorshipAmount: null,
    publishedAt: null, startedAt: null, completedAt: null,
    cancelledAt: null, cancellationReason: null,
    registeredCount: 0, attendedCount: 0, absentCount: 0,
    createdAt: NOW, updatedAt: NOW, createdBy: 'user-1', updatedBy: null,
    deletedAt: null, deletedBy: null, version: 1,
  };
}

function makeDocument(overrides: Partial<EventDocumentRow> = {}): EventDocumentRow {
  return {
    id: 'doc-1', schoolId: SCHOOL, eventId: 'evt-1', fileAssetId: 'asset-1',
    documentType: 'CIRCULAR', title: 'Circular', description: null,
    isPublic: false, uploadedBy: 'user-1',
    createdAt: NOW, updatedAt: NOW, createdBy: 'user-1', updatedBy: null,
    deletedAt: null, deletedBy: null, version: 1,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo = {
    list: jest.fn().mockResolvedValue({ rows: [], nextCursorId: null }) as jest.Mock,
    findById: jest.fn() as jest.Mock,
    create: jest.fn(async () => makeDocument()),
    softDelete: jest.fn(),
  };
  const eventRepo = {
    findById: jest.fn(async () => makeEvent()) as jest.Mock,
  };
  const fileAssetService = {
    upload: jest.fn(async () => ({ id: 'asset-1', storageKey: 'k', mimeType: 'application/pdf' })) as jest.Mock,
    softDelete: jest.fn(),
  };
  const featureFlags = { isEnabled: jest.fn(async (_key?: string) => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };
  const svc = new EventDocumentService(
    prisma as never,
    repo as never,
    eventRepo as never,
    fileAssetService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return { svc, repo, eventRepo, fileAssetService, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({
    schoolId: SCHOOL, userId: 'user-1', actorScope: 'tenant',
  });
  return RequestContextRegistry.run(ctx, fn);
}

describe('EventDocumentService.upload', () => {
  it('uploads FileAsset then inserts EventDocument row + outbox + audit', async () => {
    const t = makeService();
    const row = await withCtx(() =>
      t.svc.upload({
        eventId: 'evt-1', documentType: 'CIRCULAR', title: 'Circular',
        fileName: 'c.pdf', mimeType: 'application/pdf', body: Buffer.from('hi'),
      }),
    );
    expect(row.id).toBe('doc-1');
    expect(t.fileAssetService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'EVENT_DOCUMENT', fileName: 'c.pdf' }),
    );
    expect(t.repo.create).toHaveBeenCalled();
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.DOCUMENT_UPLOADED);
  });

  it('refuses when event missing', async () => {
    const t = makeService();
    t.eventRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() =>
        t.svc.upload({
          eventId: 'evt-missing', documentType: 'CIRCULAR', title: 'X',
          fileName: 'c.pdf', mimeType: 'application/pdf', body: Buffer.from('hi'),
        }),
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);
    expect(t.fileAssetService.upload).not.toHaveBeenCalled();
  });

  it('cleans up orphaned FileAsset when row insert fails', async () => {
    const t = makeService();
    t.repo.create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      withCtx(() =>
        t.svc.upload({
          eventId: 'evt-1', documentType: 'CIRCULAR', title: 'X',
          fileName: 'c.pdf', mimeType: 'application/pdf', body: Buffer.from('hi'),
        }),
      ),
    ).rejects.toThrow('db down');
    expect(t.fileAssetService.softDelete).toHaveBeenCalledWith('asset-1');
  });
});

describe('EventDocumentService.delete', () => {
  it('soft-deletes the row + best-effort soft-deletes the asset', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeDocument());
    await withCtx(() => t.svc.delete('evt-1', 'doc-1', 1));
    expect(t.repo.softDelete).toHaveBeenCalledWith('doc-1', 1, {});
    expect(t.fileAssetService.softDelete).toHaveBeenCalledWith('asset-1');
    const topics = (t.outbox.publish.mock.calls as unknown as Array<[unknown, { topic: string }]>).map(
      (c) => c[1].topic,
    );
    expect(topics).toContain(EventsOutboxTopics.DOCUMENT_DELETED);
  });

  it('throws NotFound when document missing or wrong eventId', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.delete('evt-1', 'doc-1', 1)),
    ).rejects.toBeInstanceOf(EventDocumentNotFoundError);
  });

  it('does not throw when asset cleanup fails', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeDocument());
    t.fileAssetService.softDelete.mockRejectedValueOnce(new Error('s3 down'));
    await expect(
      withCtx(() => t.svc.delete('evt-1', 'doc-1', 1)),
    ).resolves.toBeUndefined();
  });
});
