/**
 * Sprint 13.1 e2e — Import foundation (Patches A, B, C).
 *
 * Exercises:
 *   - Patch A: ImportTemplateService rendering for STUDENT (CSV/XLSX) +
 *     STAFF stub kind, with `*` flag on required columns and bundled
 *     sample rows.
 *   - Patch B: ImportPreviewService parses + validates a real CSV against
 *     the registered StudentImportRowValidator, returning the canonical
 *     summary shape (totalRows / validRows / invalidRows / importStatus /
 *     errors[]).
 *   - Patch C: ImportCommitHandler persists per-row commit failures as
 *     WARNING ImportJobIssue rows; ImportErrorExportService blends those
 *     WARNINGs with VALIDATION ERRORs into a single CSV / XLSX download.
 *   - Patch C4: ImportJobResponseDto.importStatus derives CLEAN / PARTIAL /
 *     INVALID at response time from the persisted row counts.
 */
import { ImportPreviewService } from '../../src/core/reporting/import/preview/preview.service';
import { ImportErrorExportService } from '../../src/core/reporting/import/error-export/error-export.service';
import { ImportTemplateRegistry } from '../../src/core/reporting/import/templates/template.registry';
import { ImportTemplateService } from '../../src/core/reporting/import/templates/template.service';
import { STUDENT_TEMPLATE_SPEC } from '../../src/core/reporting/import/templates/student.template';
import {
  STAFF_TEMPLATE_SPEC,
  ATTENDANCE_TEMPLATE_SPEC,
  EXAM_MARKS_TEMPLATE_SPEC,
  FEE_PAYMENT_TEMPLATE_SPEC,
} from '../../src/core/reporting/import/templates/stub.templates';
import { ImportJobResponseDto } from '../../src/core/reporting/import/import.dto';
import {
  REPORTING_JOB_HANDLERS,
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

describe('Sprint 13.1 — Patch A: template download', () => {
  function makeTemplateService(): ImportTemplateService {
    const reg = new ImportTemplateRegistry();
    reg.register(STUDENT_TEMPLATE_SPEC);
    reg.register(STAFF_TEMPLATE_SPEC);
    reg.register(ATTENDANCE_TEMPLATE_SPEC);
    reg.register(EXAM_MARKS_TEMPLATE_SPEC);
    reg.register(FEE_PAYMENT_TEMPLATE_SPEC);
    return new ImportTemplateService(reg);
  }

  it('CSV template flags every required STUDENT column with "*"', async () => {
    const svc = makeTemplateService();
    const built = await svc.build('STUDENT', 'csv');
    const headerLine = built.buffer.toString('utf8').split('\n')[0]!;
    for (const col of STUDENT_TEMPLATE_SPEC.columns) {
      if (col.required) expect(headerLine).toContain(`${col.name}*`);
    }
    // Filename + mime
    expect(built.filename).toBe('student-import-template.csv');
    expect(built.mimeType).toContain('text/csv');
  });

  it('XLSX template downloads cleanly for every registered kind', async () => {
    const svc = makeTemplateService();
    for (const kind of ['STUDENT', 'STAFF', 'ATTENDANCE', 'EXAM_MARKS', 'FEE_PAYMENT'] as const) {
      const built = await svc.build(kind, 'xlsx');
      expect(built.buffer.length).toBeGreaterThan(0);
      expect(built.mimeType).toContain('spreadsheetml.sheet');
    }
  });
});

describe('Sprint 13.1 — Patch B: preview endpoint', () => {
  it('preview returns CLEAN / PARTIAL / INVALID summary for a real CSV', async () => {
    const h = createSprint13Harness();
    // Build the preview service from harness internals (parser registry +
    // validator registry are exposed via the handlers' constructors).
    const preview = new ImportPreviewService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h.importRunHandler as any).parsers,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h.importRunHandler as any).validators,
    );

    const cleanCsv = [
      HEADER,
      row('ADM-1', 'A', 'A', '2010-01-01', 'MALE'),
      row('ADM-2', 'B', 'B', '2010-02-01', 'FEMALE'),
    ].join('\n');
    const partialCsv = [
      HEADER,
      row('ADM-3', 'C', 'C', '2010-03-01', 'MALE'),
      row('ADM-4', '', 'NoFirst', '2010-04-01', 'FEMALE'),
    ].join('\n');
    const invalidCsv = [
      HEADER,
      row('ADM-5', '', 'X', 'not-a-date', 'FEMALE'),
    ].join('\n');

    const cleanOut = await h.withCtx(() =>
      preview.preview({
        buffer: Buffer.from(cleanCsv),
        mimeType: 'text/csv',
        kind: 'STUDENT',
      }),
    );
    expect(cleanOut.summary.importStatus).toBe('CLEAN');
    expect(cleanOut.summary.validRows).toBe(2);
    expect(cleanOut.summary.invalidRows).toBe(0);

    const partialOut = await h.withCtx(() =>
      preview.preview({
        buffer: Buffer.from(partialCsv),
        mimeType: 'text/csv',
        kind: 'STUDENT',
      }),
    );
    expect(partialOut.summary.importStatus).toBe('PARTIAL');
    expect(partialOut.summary.validRows).toBe(1);
    expect(partialOut.summary.invalidRows).toBe(1);
    expect(partialOut.summary.errors.length).toBeGreaterThanOrEqual(1);

    const invalidOut = await h.withCtx(() =>
      preview.preview({
        buffer: Buffer.from(invalidCsv),
        mimeType: 'text/csv',
        kind: 'STUDENT',
      }),
    );
    expect(invalidOut.summary.importStatus).toBe('INVALID');
    expect(invalidOut.summary.validRows).toBe(0);
    expect(invalidOut.summary.errors.length).toBeGreaterThanOrEqual(1);
    // Preview does not persist any FileAsset
    expect(h.fileAssetService.upload).not.toHaveBeenCalled();
  });
});

describe('Sprint 13.1 — Patch C: commit-time WARNINGs + error export', () => {
  it('persists commit-time failures as WARNINGs and surfaces them in the issues export', async () => {
    const h = createSprint13Harness();
    const csv = [
      HEADER,
      row('ADM-1', 'A', 'A', '2010-01-01', 'MALE'),
      row('ADM-2', 'B', 'B', '2010-02-01', 'FEMALE'),
      // One invalid row → validation ERROR
      row('ADM-3', '', 'NoFirst', '2010-03-01', 'MALE'),
    ].join('\n');

    // Force a commit-time failure on one of the 2 valid rows by stubbing
    // the StudentCommitter result. Validation still produces 2 valid rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const committer = (h.importCommitHandler as any).committers.get('STUDENT');
    const originalCommit = committer.commit.bind(committer);
    let committerCallCount = 0;
    committer.commit = async (
      rows: ReadonlyArray<{ rowNumber: number }>,
      ctx: unknown,
      tx: unknown,
    ) => {
      committerCallCount += 1;
      const out = await originalCommit(rows, ctx, tx);
      // Synthesize one commit-time failure (drop committed by 1, append failed row).
      const lastRow = rows[rows.length - 1];
      const targetRowNumber = lastRow?.rowNumber ?? 0;
      return {
        committed: Math.max(out.committed - 1, 0),
        failed: [
          ...out.failed,
          { rowNumber: targetRowNumber, message: 'admissionNo conflict.' },
        ],
      };
    };

    // ---- Create + run validation ------------------------------------------
    const created = await h.withCtx(() =>
      h.importJobService.create({
        kind: 'STUDENT',
        sourceFile: {
          fileName: 'students.csv',
          mimeType: 'text/csv',
          body: Buffer.from(csv),
        },
      }),
    );
    expect(created.status).toBe('PENDING');

    const runPayload = (h.jobEnqueueService.enqueue.mock.calls[0]![0] as {
      payload: { importJobId: string; schoolId: string };
    }).payload;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (h.importRunHandler as any).handle(runPayload, h.jobCtx());

    const afterValidate = await h.withCtx(() =>
      h.importJobService.getById(created.id),
    );
    expect(afterValidate.status).toBe('VALIDATED');
    expect(afterValidate.validRows).toBe(2);
    expect(afterValidate.errorRows).toBe(1);

    // Patch C4 — derived importStatus on the live row
    const dto = ImportJobResponseDto.from(afterValidate);
    expect(dto.importStatus).toBe('PARTIAL');

    // ---- Promote + run commit handler -------------------------------------
    await h.withCtx(() =>
      h.importJobService.commit(created.id, afterValidate.version),
    );
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
    expect(committerCallCount).toBeGreaterThanOrEqual(1);

    // ---- Verify issues now hold ERROR + WARNING ---------------------------
    const issues = await h.withCtx(() =>
      h.importJobService.listIssues({
        importJobId: created.id,
        limit: 100,
      }),
    );
    const severities = issues.items.map((i) => i.severity).sort();
    expect(severities).toContain('ERROR');
    expect(severities).toContain('WARNING');
    const commitFailed = issues.items.find((i) => i.code === 'COMMIT_FAILED');
    expect(commitFailed).toBeDefined();
    expect(commitFailed!.severity).toBe('WARNING');

    // ---- Error export (Patch C3) blends both ------------------------------
    const errorExport = new ImportErrorExportService(
      h.importJobIssueRepository as never,
    );
    const csvExport = await h.withCtx(() =>
      errorExport.exportCsv({ importJobId: created.id }),
    );
    const csvBody = csvExport.buffer.toString('utf8');
    expect(csvBody).toContain('rowNumber');
    expect(csvBody).toContain('COMMIT_FAILED');
    expect(csvBody).toContain('WARNING');
    expect(csvBody).toContain('ERROR');

    const xlsxExport = await h.withCtx(() =>
      errorExport.exportXlsx({ importJobId: created.id }),
    );
    expect(xlsxExport.buffer.length).toBeGreaterThan(0);
    expect(xlsxExport.mimeType).toContain('spreadsheetml.sheet');
  });
});

describe('Sprint 13.1 — Patch C4: importStatus DTO derivation', () => {
  it('CLEAN when zero error rows; INVALID when zero valid rows', () => {
    const base = {
      id: 'imp-1',
      schoolId: 'school-1',
      code: 'IMP-1',
      kind: 'STUDENT',
      status: 'COMMITTED',
      requestedByUserId: 'u',
      requestedAt: new Date(),
      sourceFileAssetId: 'asset-1',
      options: {},
      queuedJobId: null,
      startedAt: null,
      endedAt: null,
      errorMessage: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as const;

    const cleanDto = ImportJobResponseDto.from({
      ...base,
      totalRows: 5,
      validRows: 5,
      errorRows: 0,
      committedRows: 5,
    } as never);
    expect(cleanDto.importStatus).toBe('CLEAN');

    const invalidDto = ImportJobResponseDto.from({
      ...base,
      totalRows: 5,
      validRows: 0,
      errorRows: 5,
      committedRows: 0,
    } as never);
    expect(invalidDto.importStatus).toBe('INVALID');

    const partialDto = ImportJobResponseDto.from({
      ...base,
      totalRows: 5,
      validRows: 3,
      errorRows: 2,
      committedRows: 3,
    } as never);
    expect(partialDto.importStatus).toBe('PARTIAL');
  });
});
