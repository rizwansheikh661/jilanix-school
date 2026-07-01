/**
 * Sprint 13 e2e — ReportRun lifecycle (STUDENT_LIST / CSV).
 *
 * Walks the full PENDING → RUNNING → SUCCEEDED path:
 *   1. reportService.create enqueues a job + emits report.run.requested.
 *   2. reportRunHandler.handle (invoked directly with the enqueued payload)
 *      drives the engine + formatter + fileAssetService.upload, marks
 *      SUCCEEDED, dispatches REPORT_READY, and emits report.run.succeeded.
 *   3. The download path resolves the materialized fileAsset to the mocked URL.
 */
import {
  REPORTING_JOB_HANDLERS,
  ReportingNotificationEventKeys,
  ReportingOutboxTopics,
  FILE_PURPOSE_REPORT_EXPORT,
} from '../../src/core/reporting/reporting.constants';
import { createSprint13Harness } from './helpers';

describe('Sprint 13 — ReportRun e2e (STUDENT_LIST / CSV)', () => {
  it('PENDING → RUNNING → SUCCEEDED produces a CSV asset, dispatches REPORT_READY, and exposes a download URL', async () => {
    const h = createSprint13Harness();

    // -- Seed 3 students that the engine will project ------------------------
    h.seedStudents([
      { id: 'stu-1', admissionNo: 'ADM-1001', firstName: 'Aanya', lastName: 'Sharma' },
      { id: 'stu-2', admissionNo: 'ADM-1002', firstName: 'Bharath', lastName: 'Iyer' },
      { id: 'stu-3', admissionNo: 'ADM-1003', firstName: 'Chitra', lastName: 'Rao' },
    ]);

    // -- Create the report run ----------------------------------------------
    const created = await h.withCtx(() =>
      h.reportService.create({
        kind: 'STUDENT_LIST',
        format: 'CSV',
        params: { sectionId: 'sec-1' },
      }),
    );
    expect(created.status).toBe('PENDING');
    expect(created.code).toMatch(/^RPT-\d{6}$/);
    expect(created.queuedJobId).not.toBeNull();
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.REPORT_RUN_REQUESTED);
    expect(h.jobEnqueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        handlerName: REPORTING_JOB_HANDLERS.REPORT_RUN,
        payload: expect.objectContaining({
          reportRunId: created.id,
          schoolId: expect.any(String),
        }),
      }),
      expect.anything(),
    );

    // -- Pull the enqueued payload + invoke the handler directly ------------
    const enqueueArgs = h.jobEnqueueService.enqueue.mock.calls[0]![0] as {
      payload: { reportRunId: string; schoolId: string };
    };
    const payload = enqueueArgs.payload;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (h.reportRunHandler as any).handle(payload, h.jobCtx());

    // -- Final row state -----------------------------------------------------
    const finalised = await h.withCtx(() => h.reportService.getById(created.id));
    expect(finalised.status).toBe('SUCCEEDED');
    expect(finalised.fileAssetId).not.toBeNull();
    expect(finalised.rowCount).toBe(3);
    expect(finalised.startedAt).toBeInstanceOf(Date);
    expect(finalised.endedAt).toBeInstanceOf(Date);

    // -- File asset upload was called with the expected envelope ------------
    expect(h.fileAssetService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: FILE_PURPOSE_REPORT_EXPORT,
        mimeType: expect.stringContaining('text/csv'),
        isPublic: false,
        fileName: expect.stringMatching(/^RPT-\d{6}\.csv$/),
      }),
    );

    // -- Lifecycle outbox + notification dispatch ---------------------------
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.REPORT_RUN_STARTED);
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.REPORT_RUN_SUCCEEDED);
    expect(h.dispatchedEventKeys()).toContain(
      ReportingNotificationEventKeys.REPORT_READY,
    );
    expect(h.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: ReportingNotificationEventKeys.REPORT_READY,
        aggregateType: 'ReportRun',
        aggregateId: created.id,
      }),
    );

    // -- Download URL resolution (service → fileAssets.buildDownloadUrl) ----
    const dl = await h.withCtx(() => h.reportService.getDownload(created.id));
    expect(dl.fileAssetId).toBe(finalised.fileAssetId);
    const url = await h.fileAssetService.buildDownloadUrl(dl.fileAssetId);
    expect(url.url).toMatch(/^https:\/\/download\.example\.test\//);
  });
});
