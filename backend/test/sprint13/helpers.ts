/**
 * Sprint 13 e2e helpers — service-orchestration harness for the reporting
 * module. Wires real ReportRunService / ImportJobService / handlers / engines
 * / parsers / validators / committers / formatter against in-memory repo
 * fakes + mocked external services (FileAssetService, FeatureFlagService,
 * NotificationEventDispatcherService, SequenceService, JobEnqueueService,
 * OutboxPublisherService, AuditService, StudentService).
 *
 * Mirrors sprint10/sprint11/sprint12 helpers — no real DB, no real provider IO.
 */
import { Readable } from 'node:stream';

import { ExportFormatterService } from '../../src/core/reporting/export/export-formatter.service';
import { ImportCommitHandler } from '../../src/core/reporting/import/import-commit.handler';
import { ImportRunHandler } from '../../src/core/reporting/import/import-run.handler';
import { ImportJobIssueRepository } from '../../src/core/reporting/import/import-issue.repository';
import { ImportJobRepository } from '../../src/core/reporting/import/import.repository';
import { ImportJobService } from '../../src/core/reporting/import/import.service';
import { RowCommitterRegistry } from '../../src/core/reporting/import/committers/committer.registry';
import { StudentCommitter } from '../../src/core/reporting/import/committers/student.committer';
import { ImportParserRegistry } from '../../src/core/reporting/import/parsers/parser.registry';
import { StudentParser } from '../../src/core/reporting/import/parsers/student.parser';
import { ReportEngineRegistry } from '../../src/core/reporting/report-engine/report-engine.registry';
import { ReportEngineService } from '../../src/core/reporting/report-engine/report-engine.service';
import { StudentListEngine } from '../../src/core/reporting/report-engine/student-list.engine';
import { ReportRunHandler } from '../../src/core/reporting/report/report-run.handler';
import { ReportRunRepository } from '../../src/core/reporting/report/report.repository';
import { ReportRunService } from '../../src/core/reporting/report/report.service';
import { ValidatorRegistry } from '../../src/core/reporting/validation/validator.registry';
import { StudentImportRowValidator } from '../../src/core/reporting/validation/student-import-row.validator';
import { JobHandlerRegistry } from '../../src/core/jobs/handlers/job-handler.registry';
import type { JobHandlerContext, JobRow } from '../../src/core/jobs/jobs.types';
import type {
  ImportJobIssueRow,
  ImportJobRow,
  ReportRunRow,
  RowValidationIssue,
} from '../../src/core/reporting/reporting.types';
import type { StudentRow } from '../../src/core/student/student.types';
import { RequestContextRegistry } from '../../src/core/request-context';

const SCHOOL = 'school-1';
const USER = 'user-admin';
const NOW = new Date('2026-06-22T12:00:00.000Z');

let idSeq = 0;
const id = (p: string) => `${p}-${(++idSeq).toString().padStart(4, '0')}`;

// -----------------------------------------------------------------------------
// Harness shape
// -----------------------------------------------------------------------------
export interface Sprint13Harness {
  readonly reportService: ReportRunService;
  readonly reportRepository: { findById: jest.Mock };
  readonly reportRunHandler: ReportRunHandler;
  readonly reportEngineService: ReportEngineService;
  readonly reportEngineRegistry: ReportEngineRegistry;
  readonly exportFormatterService: ExportFormatterService;
  readonly importJobService: ImportJobService;
  readonly importJobRepository: { findById: jest.Mock };
  readonly importJobIssueRepository: { list: jest.Mock };
  readonly importRunHandler: ImportRunHandler;
  readonly importCommitHandler: ImportCommitHandler;
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly featureFlags: { isEnabled: jest.Mock };
  readonly dispatcher: { dispatch: jest.Mock };
  readonly fileAssetService: {
    upload: jest.Mock;
    getById: jest.Mock;
    streamForDownload: jest.Mock;
    softDelete: jest.Mock;
    buildDownloadUrl: jest.Mock;
  };
  readonly sequences: { nextValue: jest.Mock };
  readonly jobEnqueueService: { enqueue: jest.Mock };
  readonly state: HarnessState;
  outboxTopics(): string[];
  dispatchedEventKeys(): string[];
  withCtx<T>(fn: () => Promise<T>): Promise<T>;
  seedStudents(items: ReadonlyArray<Partial<StudentRow> & { id: string }>): void;
  seedFileAssetContent(fileAssetId: string, buffer: Buffer, mimeType?: string): void;
  jobCtx(): JobHandlerContext;
}

interface HarnessState {
  reportRuns: Map<string, ReportRunRow>;
  importJobs: Map<string, ImportJobRow>;
  importIssues: Map<string, ImportJobIssueRow>;
  students: Array<StudentRow>;
  createdStudents: Array<{ admissionNo: string }>;
  fileAssets: Map<string, { id: string; mimeType: string; body: Buffer }>;
}

export interface HarnessOpts {
  readonly featureFlags?: Record<string, boolean>;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------
export function createSprint13Harness(opts: HarnessOpts = {}): Sprint13Harness {
  const state: HarnessState = {
    reportRuns: new Map(),
    importJobs: new Map(),
    importIssues: new Map(),
    students: [],
    createdStudents: [],
    fileAssets: new Map(),
  };

  // ---- Outbox + audit ---------------------------------------------------
  const outboxCalls: Array<{ topic: string }> = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, p: { topic: string }) => {
      outboxCalls.push({ topic: p.topic });
    }),
  };
  const audit = {
    record: jest.fn(async () => ({ id: id('audit'), rowHash: 'h' })),
  };

  // ---- Feature flags ----------------------------------------------------
  const flagsMap: Record<string, boolean> = {
    'module.reporting': true,
    'reporting.allow_report_run': true,
    'reporting.allow_import': true,
    'reporting.allow_bulk_operations': true,
    'reporting.import_student_enabled': true,
    'reporting.notify_on_completion': true,
    ...(opts.featureFlags ?? {}),
  };
  const featureFlags = {
    isEnabled: jest.fn(async (key: string) => flagsMap[key] ?? false),
  };

  // ---- Notification dispatcher -----------------------------------------
  const dispatchedEvents: Array<{ eventKey: string }> = [];
  const dispatcher = {
    dispatch: jest.fn(async (input: { eventKey: string }) => {
      dispatchedEvents.push({ eventKey: input.eventKey });
      return undefined;
    }),
  };

  // ---- File asset service ----------------------------------------------
  const fileAssetService = {
    upload: jest.fn(async (input: {
      purpose: string;
      fileName: string;
      mimeType: string;
      body: Buffer;
      isPublic?: boolean;
    }) => {
      const assetId = id('asset');
      state.fileAssets.set(assetId, {
        id: assetId,
        mimeType: input.mimeType,
        body: input.body,
      });
      return {
        id: assetId,
        storageKey: `k/${input.fileName}`,
        mimeType: input.mimeType,
        fileName: input.fileName,
        bucket: 'test',
      };
    }),
    getById: jest.fn(async (assetId: string) => {
      const asset = state.fileAssets.get(assetId);
      if (asset === undefined) {
        throw new Error(`fileAsset ${assetId} not seeded`);
      }
      return {
        id: asset.id,
        mimeType: asset.mimeType,
        fileName: 'file',
        bucket: 'test',
        storageKey: 'k/file',
        sizeBytes: asset.body.byteLength,
        scanStatus: 'CLEAN',
      };
    }),
    streamForDownload: jest.fn(async (assetId: string) => {
      const asset = state.fileAssets.get(assetId);
      if (asset === undefined) {
        throw new Error(`fileAsset ${assetId} not seeded`);
      }
      return {
        row: { id: asset.id, mimeType: asset.mimeType },
        stream: Readable.from([asset.body]) as unknown as NodeJS.ReadableStream,
      };
    }),
    softDelete: jest.fn(async () => undefined),
    buildDownloadUrl: jest.fn(async (assetId: string) => ({
      url: `https://download.example.test/${assetId}`,
      expiresInSeconds: 600,
    })),
  };

  // ---- Sequences --------------------------------------------------------
  const seqCounters = new Map<string, number>();
  const sequences = {
    nextValue: jest.fn(async (name: string, _opts?: { tx?: unknown }) => {
      const cur = (seqCounters.get(name) ?? 0) + 1;
      seqCounters.set(name, cur);
      return cur;
    }),
  };

  // ---- Job enqueue ------------------------------------------------------
  const enqueueCalls: Array<{ handlerName: string; payload: unknown }> = [];
  const jobEnqueueService = {
    enqueue: jest.fn(async (input: { handlerName: string; payload: unknown }) => {
      enqueueCalls.push({
        handlerName: input.handlerName,
        payload: input.payload,
      });
      return { id: id('job') } as Partial<JobRow>;
    }),
  };

  // ---- Prisma stub ------------------------------------------------------
  // Repos are mocked in-memory so prisma never sees a real query; the txStub
  // is only handed back through `prisma.transaction(fn)` so callers that
  // pass `tx` to repo methods still get a plausible object.
  const txStub = {};
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txStub),
    ),
    client: txStub,
  };

  // ---- Report run repo (in-memory) --------------------------------------
  const reportRepo = {
    findById: jest.fn(async (rid: string, _tx?: unknown) =>
      state.reportRuns.get(rid) ?? null,
    ),
    findActiveByCode: jest.fn(async (code: string) => {
      for (const r of state.reportRuns.values()) {
        if (r.code === code && r.deletedAt === null) return r;
      }
      return null;
    }),
    list: jest.fn(async () => ({
      rows: [...state.reportRuns.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: ReportRunRow = {
        id: id('rpt'),
        schoolId: SCHOOL,
        code: input.code as string,
        kind: input.kind as ReportRunRow['kind'],
        format: input.format as ReportRunRow['format'],
        status: 'PENDING',
        requestedByUserId: input.requestedByUserId as string,
        requestedAt: NOW,
        params: (input.params as Record<string, unknown>) ?? {},
        queuedJobId: null,
        startedAt: null,
        endedAt: null,
        errorMessage: null,
        fileAssetId: null,
        rowCount: 0,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      };
      state.reportRuns.set(row.id, row);
      return row;
    }),
    updateStatus: jest.fn(
      async (
        rid: string,
        expectedVersion: number,
        patch: Partial<ReportRunRow>,
        _tx?: unknown,
      ) => {
        const cur = state.reportRuns.get(rid);
        if (cur === undefined || cur.version !== expectedVersion) {
          throw new Error(
            `ReportRun version conflict id=${rid} expected=${expectedVersion} got=${cur?.version}`,
          );
        }
        const next: ReportRunRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.reportRuns.set(rid, next);
        return next;
      },
    ),
    softDelete: jest.fn(async (rid: string, expectedVersion: number) => {
      const cur = state.reportRuns.get(rid);
      if (cur === undefined || cur.version !== expectedVersion) {
        throw new Error(`ReportRun version conflict id=${rid}`);
      }
      state.reportRuns.set(rid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
    bumpQueuedJobId: jest.fn(
      async (rid: string, queuedJobId: string) => {
        const cur = state.reportRuns.get(rid);
        if (cur === undefined) return;
        state.reportRuns.set(rid, { ...cur, queuedJobId });
      },
    ),
  };

  // ---- Import job repo (in-memory) --------------------------------------
  const importRepo = {
    findById: jest.fn(async (jid: string, _tx?: unknown) =>
      state.importJobs.get(jid) ?? null,
    ),
    findActiveByCode: jest.fn(async (code: string) => {
      for (const j of state.importJobs.values()) {
        if (j.code === code && j.deletedAt === null) return j;
      }
      return null;
    }),
    list: jest.fn(async () => ({
      rows: [...state.importJobs.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: ImportJobRow = {
        id: id('imp'),
        schoolId: SCHOOL,
        code: input.code as string,
        kind: input.kind as ImportJobRow['kind'],
        status: 'PENDING',
        requestedByUserId: USER,
        requestedAt: NOW,
        sourceFileAssetId: input.sourceFileAssetId as string,
        options: (input.options as Record<string, unknown>) ?? {},
        queuedJobId: null,
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        committedRows: 0,
        startedAt: null,
        endedAt: null,
        errorMessage: null,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      };
      state.importJobs.set(row.id, row);
      return row;
    }),
    updateStatus: jest.fn(
      async (
        jid: string,
        expectedVersion: number,
        patch: Partial<ImportJobRow>,
        _tx?: unknown,
      ) => {
        const cur = state.importJobs.get(jid);
        if (cur === undefined || cur.version !== expectedVersion) {
          throw new Error(
            `ImportJob version conflict id=${jid} expected=${expectedVersion} got=${cur?.version}`,
          );
        }
        const next: ImportJobRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.importJobs.set(jid, next);
        return next;
      },
    ),
    bumpQueuedJobId: jest.fn(async (jid: string, queuedJobId: string) => {
      const cur = state.importJobs.get(jid);
      if (cur === undefined) return;
      state.importJobs.set(jid, { ...cur, queuedJobId });
    }),
    softDelete: jest.fn(async (jid: string, expectedVersion: number) => {
      const cur = state.importJobs.get(jid);
      if (cur === undefined || cur.version !== expectedVersion) return;
      state.importJobs.set(jid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
  };

  // ---- Import issue repo (in-memory) ------------------------------------
  const importIssueRepo = {
    createMany: jest.fn(
      async (importJobId: string, issues: readonly RowValidationIssue[]) => {
        for (const iss of issues) {
          const row: ImportJobIssueRow = {
            id: id('iss'),
            schoolId: SCHOOL,
            importJobId,
            rowNumber: iss.rowNumber,
            columnName: iss.columnName ?? null,
            severity: iss.severity,
            code: iss.code,
            message: iss.message.slice(0, 1000),
            providedValue:
              iss.providedValue === undefined || iss.providedValue === null
                ? null
                : iss.providedValue.slice(0, 500),
            rowSnapshot:
              (iss.rowSnapshot as Record<string, unknown> | undefined) ?? null,
            version: 1,
            createdAt: NOW,
          };
          state.importIssues.set(row.id, row);
        }
        return issues.length;
      },
    ),
    list: jest.fn(async (args: { importJobId: string }) => ({
      rows: [...state.importIssues.values()].filter(
        (r) => r.importJobId === args.importJobId,
      ),
      nextCursorId: null,
    })),
    countByJob: jest.fn(async (importJobId: string) => {
      const rows = [...state.importIssues.values()].filter(
        (r) => r.importJobId === importJobId,
      );
      let errors = 0;
      let warnings = 0;
      let infos = 0;
      for (const r of rows) {
        if (r.severity === 'ERROR') errors += 1;
        else if (r.severity === 'WARNING') warnings += 1;
        else if (r.severity === 'INFO') infos += 1;
      }
      return { total: rows.length, errors, warnings, infos };
    }),
  };

  // ---- Student service stub (for engine + committer) --------------------
  const studentServiceStub = {
    list: jest.fn(async (args: { limit: number; cursorId?: string }) => {
      const all = state.students.slice();
      const offset =
        args.cursorId === undefined
          ? 0
          : all.findIndex((s) => s.id === args.cursorId) + 1;
      const slice = all.slice(offset, offset + args.limit);
      const hasMore = offset + slice.length < all.length;
      return {
        items: slice,
        nextCursorId: hasMore ? slice[slice.length - 1]!.id : null,
      };
    }),
    create: jest.fn(
      async (args: { admissionNo: string }, _tx?: unknown) => {
        state.createdStudents.push({ admissionNo: args.admissionNo });
        return { id: id('stu'), admissionNo: args.admissionNo } as unknown;
      },
    ),
  };

  // ---- Compose engine + parser + validator + committer registries -------
  const reportEngineRegistry = new ReportEngineRegistry();
  const exportFormatterService = new ExportFormatterService();
  const studentListEngine = new StudentListEngine(
    reportEngineRegistry,
    studentServiceStub as never,
  );
  studentListEngine.onApplicationBootstrap();
  const reportEngineService = new ReportEngineService(reportEngineRegistry);

  const importParserRegistry = new ImportParserRegistry();
  const studentParser = new StudentParser(importParserRegistry);
  studentParser.onApplicationBootstrap();

  const validatorRegistry = new ValidatorRegistry();
  validatorRegistry.register('STUDENT', new StudentImportRowValidator());

  const rowCommitterRegistry = new RowCommitterRegistry();
  const studentCommitter = new StudentCommitter(
    rowCommitterRegistry,
    studentServiceStub as never,
  );
  studentCommitter.onApplicationBootstrap();

  // ---- Compose services -------------------------------------------------
  const reportService = new ReportRunService(
    prisma as never,
    reportRepo as unknown as ReportRunRepository,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    jobEnqueueService as never,
  );

  const importJobService = new ImportJobService(
    prisma as never,
    importRepo as unknown as ImportJobRepository,
    importIssueRepo as unknown as ImportJobIssueRepository,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    jobEnqueueService as never,
    fileAssetService as never,
  );

  // ---- Handlers ---------------------------------------------------------
  const jobRegistry = new JobHandlerRegistry();

  const reportRunHandler = new ReportRunHandler(
    jobRegistry,
    reportService,
    reportEngineService,
    exportFormatterService,
    fileAssetService as never,
    featureFlags as never,
    dispatcher as never,
  );

  const importRunHandler = new ImportRunHandler(
    jobRegistry,
    importJobService,
    importIssueRepo as unknown as ImportJobIssueRepository,
    importParserRegistry,
    validatorRegistry,
    fileAssetService as never,
    featureFlags as never,
    dispatcher as never,
  );

  const importCommitHandler = new ImportCommitHandler(
    jobRegistry,
    prisma as never,
    importJobService,
    importParserRegistry,
    validatorRegistry,
    rowCommitterRegistry,
    fileAssetService as never,
    featureFlags as never,
    dispatcher as never,
    importIssueRepo as unknown as ImportJobIssueRepository,
  );

  // -----------------------------------------------------------------------
  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = RequestContextRegistry.makeSystemContext({
      schoolId: SCHOOL,
      userId: USER,
      actorScope: 'tenant',
    });
    return RequestContextRegistry.run(ctx, fn);
  }

  function jobCtx(): JobHandlerContext {
    return {
      job: {
        id: id('job-ctx'),
        schoolId: SCHOOL,
        queue: 'test',
        type: 'test',
        payload: {},
        priority: 0,
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        runAt: NOW,
        claimedAt: NOW,
        claimedBy: 'worker-1',
        startedAt: NOW,
        completedAt: null,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
      },
      attempt: 1,
    };
  }

  return {
    reportService,
    reportRepository: reportRepo,
    reportRunHandler,
    reportEngineService,
    reportEngineRegistry,
    exportFormatterService,
    importJobService,
    importJobRepository: importRepo,
    importJobIssueRepository: importIssueRepo,
    importRunHandler,
    importCommitHandler,
    outbox,
    audit,
    featureFlags,
    dispatcher,
    fileAssetService,
    sequences,
    jobEnqueueService,
    state,
    outboxTopics(): string[] {
      return outboxCalls.map((c) => c.topic);
    },
    dispatchedEventKeys(): string[] {
      return dispatchedEvents.map((e) => e.eventKey);
    },
    withCtx,
    seedStudents(items) {
      for (const it of items) {
        state.students.push(makeStudent(it));
      }
    },
    seedFileAssetContent(fileAssetId, buffer, mimeType = 'text/csv') {
      state.fileAssets.set(fileAssetId, {
        id: fileAssetId,
        mimeType,
        body: buffer,
      });
    },
    jobCtx,
  };
}

function makeStudent(p: Partial<StudentRow> & { id: string }): StudentRow {
  return {
    id: p.id,
    schoolId: SCHOOL,
    firstName: p.firstName ?? 'First',
    lastName: p.lastName ?? 'Last',
    dateOfBirth: p.dateOfBirth ?? new Date('2010-01-01'),
    gender: p.gender ?? 'MALE',
    bloodGroup: p.bloodGroup ?? null,
    photoUrl: p.photoUrl ?? null,
    admissionNo: p.admissionNo ?? `ADM-${p.id}`,
    rollNo: p.rollNo ?? null,
    academicYearId: p.academicYearId ?? 'ay-1',
    classId: p.classId ?? 'cls-1',
    sectionId: p.sectionId ?? 'sec-1',
    status: p.status ?? 'ACTIVE',
    admittedOn: p.admittedOn ?? new Date('2024-04-01'),
    emergencyContacts: p.emergencyContacts ?? [],
    religion: p.religion ?? 'NOT_DECLARED',
    category: p.category ?? 'NOT_DECLARED',
    nationality: p.nationality ?? 'INDIAN',
    motherTongue: p.motherTongue ?? null,
    aadhaarLast4: p.aadhaarLast4 ?? null,
    apaarId: p.apaarId ?? null,
    isCwsn: p.isCwsn ?? false,
    disabilityType: p.disabilityType ?? null,
    isRte: p.isRte ?? false,
    isMinority: p.isMinority ?? false,
    minorityCommunity: p.minorityCommunity ?? null,
    isBpl: p.isBpl ?? false,
    previousSchoolName: p.previousSchoolName ?? null,
    previousSchoolTcNo: p.previousSchoolTcNo ?? null,
    previousSchoolTcDate: p.previousSchoolTcDate ?? null,
    admissionType: p.admissionType ?? 'FRESH',
    placeOfBirth: p.placeOfBirth ?? null,
    birthCertNo: p.birthCertNo ?? null,
    houseId: p.houseId ?? null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: USER,
    updatedBy: USER,
    version: 1,
  };
}

export const TEST_SCHOOL = SCHOOL;
export const TEST_USER = USER;
export const TEST_NOW = NOW;
