/**
 * ImportCommitHandler unit specs — focuses on Patch C1: commit-time per-row
 * failures must be persisted as WARNING ImportJobIssue rows so they ride the
 * same `/imports/:id/issues` + `.csv` / `.xlsx` paths as validation ERRORs.
 *
 * Builds a minimal handler with fake dependencies — no DB, no parser
 * bootstrap, no outbox.
 */
import { Readable } from 'node:stream';

import type {
  ImportContext,
  ValidationResult,
} from '../reporting.types';
import { JobHandlerRegistry } from '../../jobs/handlers/job-handler.registry';
import type { JobHandlerContext } from '../../jobs/jobs.types';
import { ImportParserRegistry } from './parsers/parser.registry';
import { ValidatorRegistry } from '../validation/validator.registry';
import { RowCommitterRegistry } from './committers/committer.registry';
import { ImportCommitHandler } from './import-commit.handler';

const NOW = new Date('2026-06-23T00:00:00.000Z');

interface CommitFailure {
  rowNumber: number;
  message: string;
}

function makeHandler(opts: {
  failedRows: ReadonlyArray<CommitFailure>;
  committed: number;
}): {
  handler: ImportCommitHandler;
  issueCreate: jest.Mock;
  markCommitted: jest.Mock;
  markFailed: jest.Mock;
  ctx: JobHandlerContext;
} {
  const jobRegistry = new JobHandlerRegistry();
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    client: {},
  };
  const buffer = Buffer.from('admissionNo,firstName\nADM-1,A\nADM-2,B\nADM-3,C', 'utf8');
  const service = {
    getByIdInternal: jest.fn(async () => ({
      id: 'imp-1',
      schoolId: 'school-1',
      code: 'IMP-000001',
      kind: 'STUDENT',
      status: 'COMMITTING',
      requestedByUserId: 'user-1',
      sourceFileAssetId: 'asset-1',
      options: {},
      totalRows: 3,
      validRows: 3,
      errorRows: 0,
      committedRows: 0,
      requestedAt: NOW,
      queuedJobId: null,
      startedAt: null,
      endedAt: null,
      errorMessage: null,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    })),
    markCommitted: jest.fn(async () => ({
      id: 'imp-1',
      code: 'IMP-000001',
      kind: 'STUDENT',
      requestedByUserId: 'user-1',
      totalRows: 3,
    })),
    markFailed: jest.fn(async () => undefined),
  };

  const parsers = new ImportParserRegistry();
  parsers.register({
    kind: 'STUDENT',
    parse: jest.fn(async () => [
      { admissionNo: 'ADM-1', firstName: 'A' },
      { admissionNo: 'ADM-2', firstName: 'B' },
      { admissionNo: 'ADM-3', firstName: 'C' },
    ]),
  });

  const validators = new ValidatorRegistry();
  validators.register('STUDENT', {
    validate: jest.fn(
      async (
        row: Record<string, unknown>,
        _ctx: ImportContext,
      ): Promise<ValidationResult<{ rowNumber: number }>> => ({
        ok: true,
        output: { ...row, rowNumber: (row['__rowNumber'] as number) ?? 0 },
      }),
    ),
  });

  const committers = new RowCommitterRegistry();
  committers.register({
    kind: 'STUDENT',
    commit: jest.fn(async () => ({
      committed: opts.committed,
      failed: opts.failedRows,
    })),
  });

  const fileAssets = {
    getById: jest.fn(async () => ({ mimeType: 'text/csv' })),
    streamForDownload: jest.fn(async () => ({
      stream: Readable.from([buffer]) as unknown as NodeJS.ReadableStream,
    })),
  };
  const featureFlags = { isEnabled: jest.fn(async () => false) };
  const notifications = { dispatch: jest.fn(async () => undefined) };
  const issueRepo = {
    createMany: jest.fn(async () => 0),
    list: jest.fn(async () => ({ rows: [], nextCursorId: null })),
  };

  const handler = new ImportCommitHandler(
    jobRegistry,
    prisma as never,
    service as never,
    parsers,
    validators,
    committers,
    fileAssets as never,
    featureFlags as never,
    notifications as never,
    issueRepo as never,
  );

  return {
    handler,
    issueCreate: issueRepo.createMany,
    markCommitted: service.markCommitted,
    markFailed: service.markFailed,
    ctx: {
      job: {
        id: 'job-1',
        schoolId: 'school-1',
        queue: 'test',
        type: 'test',
        payload: {},
        priority: 0,
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        runAt: NOW,
        claimedAt: NOW,
        claimedBy: 'w1',
        startedAt: NOW,
        completedAt: null,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      },
      attempt: 1,
    },
  };
}

describe('ImportCommitHandler — Patch C1 commit-time WARNING persistence', () => {
  it('persists each commit-time failure as a WARNING ImportJobIssue', async () => {
    const t = makeHandler({
      committed: 2,
      failedRows: [
        { rowNumber: 3, message: 'admissionNo conflict.' },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (t.handler as any).handle(
      { importJobId: 'imp-1', schoolId: 'school-1' },
      t.ctx,
    );
    expect(t.issueCreate).toHaveBeenCalledTimes(1);
    const [jobId, issues] = t.issueCreate.mock.calls[0]!;
    expect(jobId).toBe('imp-1');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rowNumber: 3,
      severity: 'WARNING',
      code: 'COMMIT_FAILED',
      message: 'admissionNo conflict.',
    });
    expect(t.markCommitted).toHaveBeenCalledWith('imp-1', { committedRows: 2 });
  });

  it('skips issue persistence when no rows failed', async () => {
    const t = makeHandler({ committed: 3, failedRows: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (t.handler as any).handle(
      { importJobId: 'imp-1', schoolId: 'school-1' },
      t.ctx,
    );
    expect(t.issueCreate).not.toHaveBeenCalled();
    expect(t.markCommitted).toHaveBeenCalled();
  });

  it('still marks COMMITTED when persisting WARNINGs throws (best-effort)', async () => {
    const t = makeHandler({
      committed: 2,
      failedRows: [{ rowNumber: 3, message: 'boom' }],
    });
    t.issueCreate.mockRejectedValueOnce(new Error('db unavailable'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (t.handler as any).handle(
      { importJobId: 'imp-1', schoolId: 'school-1' },
      t.ctx,
    );
    expect(t.markCommitted).toHaveBeenCalled();
    expect(t.markFailed).not.toHaveBeenCalled();
  });
});
