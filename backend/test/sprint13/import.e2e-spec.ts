/**
 * Sprint 13 e2e — Import job lifecycle (STUDENT / CSV).
 *
 * Walks PENDING → VALIDATING → VALIDATED → COMMITTING → COMMITTED:
 *   1. importJobService.create uploads the CSV (mocked), persists the job
 *      in PENDING, emits import.requested, and enqueues import.run.
 *   2. importRunHandler.handle parses + validates → 3 valid / 2 invalid,
 *      writes 2 ERROR issues, marks VALIDATED, emits import.validated.
 *   3. importJobService.commit transitions to COMMITTING + emits
 *      import.committing.
 *   4. importCommitHandler.handle calls the StudentCommitter (with a mocked
 *      StudentService) for the 3 valid rows, marks COMMITTED, dispatches
 *      IMPORT_COMPLETED, and emits import.committed.
 */
import {
  REPORTING_JOB_HANDLERS,
  ReportingNotificationEventKeys,
  ReportingOutboxTopics,
} from '../../src/core/reporting/reporting.constants';
import { createSprint13Harness } from './helpers';

const CLASS_ID = '11111111-1111-1111-1111-111111111111';
const SECTION_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

const HEADER =
  'admissionNo,firstName,lastName,dateOfBirth,gender,classId,sectionId,academicYearId,admittedOn';

function row(
  admissionNo: string,
  firstName: string,
  lastName: string,
  dob: string,
  gender: string,
): string {
  return `${admissionNo},${firstName},${lastName},${dob},${gender},${CLASS_ID},${SECTION_ID},${ACADEMIC_YEAR_ID},2024-04-01`;
}

describe('Sprint 13 — Import job e2e (STUDENT / CSV)', () => {
  it('PENDING → VALIDATED (3 valid + 2 invalid) → COMMITTING → COMMITTED dispatches IMPORT_COMPLETED', async () => {
    const h = createSprint13Harness();

    const csv = [
      HEADER,
      row('ADM-1', 'Aanya', 'Sharma', '2010-01-01', 'MALE'),
      row('ADM-2', 'Bharath', 'Iyer', '2010-02-01', 'MALE'),
      row('ADM-3', 'Chitra', 'Rao', '2010-03-01', 'FEMALE'),
      // invalid #1: empty firstName → REQUIRED_FIELD_MISSING
      row('ADM-4', '', 'Missing', '2010-04-01', 'MALE'),
      // invalid #2: dateOfBirth not ISO → INVALID_DATE
      row('ADM-5', 'BadDate', 'Row', 'not-a-date', 'FEMALE'),
    ].join('\n');
    const csvBuffer = Buffer.from(csv, 'utf8');

    // -- Create the import job ----------------------------------------------
    // The mocked fileAssetService.upload stashes the buffer keyed by the
    // returned assetId so the handler can read it back via
    // streamForDownload(asset.id) downstream.
    const created = await h.withCtx(() =>
      h.importJobService.create({
        kind: 'STUDENT',
        sourceFile: {
          fileName: 'students.csv',
          mimeType: 'text/csv',
          body: csvBuffer,
        },
        options: { commitOnSuccess: false },
      }),
    );
    expect(created.status).toBe('PENDING');
    expect(created.code).toMatch(/^IMP-\d{6}$/);
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.IMPORT_REQUESTED);
    expect(h.jobEnqueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        handlerName: REPORTING_JOB_HANDLERS.IMPORT_RUN,
        payload: expect.objectContaining({
          importJobId: created.id,
          schoolId: expect.any(String),
        }),
      }),
      expect.anything(),
    );

    // -- Run validation (the import.run handler) ----------------------------
    const runPayload = (h.jobEnqueueService.enqueue.mock.calls[0]![0] as {
      payload: { importJobId: string; schoolId: string };
    }).payload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (h.importRunHandler as any).handle(runPayload, h.jobCtx());

    const afterValidate = await h.withCtx(() =>
      h.importJobService.getById(created.id),
    );
    expect(afterValidate.status).toBe('VALIDATED');
    expect(afterValidate.totalRows).toBe(5);
    expect(afterValidate.validRows).toBe(3);
    expect(afterValidate.errorRows).toBe(2);
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.IMPORT_VALIDATING);
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.IMPORT_VALIDATED);

    const issues = await h.withCtx(() =>
      h.importJobService.listIssues({
        importJobId: created.id,
        limit: 50,
      }),
    );
    expect(issues.items.length).toBe(2);
    for (const iss of issues.items) {
      expect(iss.severity).toBe('ERROR');
    }

    // -- Promote to COMMITTING ----------------------------------------------
    const committingRow = await h.withCtx(() =>
      h.importJobService.commit(created.id, afterValidate.version),
    );
    expect(committingRow.status).toBe('COMMITTING');
    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.IMPORT_COMMITTING);

    // -- Run the commit handler ---------------------------------------------
    const commitEnqueue = h.jobEnqueueService.enqueue.mock.calls.find(
      (c) =>
        (c[0] as { handlerName: string }).handlerName ===
        REPORTING_JOB_HANDLERS.IMPORT_COMMIT,
    );
    expect(commitEnqueue).toBeDefined();
    const commitPayload = (commitEnqueue![0] as {
      payload: { importJobId: string; schoolId: string };
    }).payload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (h.importCommitHandler as any).handle(commitPayload, h.jobCtx());

    const committed = await h.withCtx(() =>
      h.importJobService.getById(created.id),
    );
    expect(committed.status).toBe('COMMITTED');
    expect(committed.committedRows).toBe(3);
    expect(h.state.createdStudents.length).toBe(3);

    expect(h.outboxTopics()).toContain(ReportingOutboxTopics.IMPORT_COMMITTED);
    expect(h.dispatchedEventKeys()).toContain(
      ReportingNotificationEventKeys.IMPORT_COMPLETED,
    );
    expect(h.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: ReportingNotificationEventKeys.IMPORT_COMPLETED,
        aggregateType: 'ImportJob',
        aggregateId: created.id,
      }),
    );
  });
});
