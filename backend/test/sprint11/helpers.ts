/**
 * Sprint 11 e2e helpers — service-orchestration harness for the Events
 * module. Wires real EventService / EventParticipantService /
 * EventAttendanceService / EventFeeAssignmentService / EventDocumentService
 * / EventResultService against in-memory repo fakes + mocked external
 * services (FeeInvoiceService, NotificationEventDispatcherService,
 * FileAssetService).
 *
 * Why service-orchestration (no real DB) — mirrors Sprint 10 helpers.ts:
 *   - Tests lock to the public service contract, not Prisma internals.
 *   - Avoids spinning Testcontainers MySQL for the e2e tier.
 *
 * Each repo fake implements only the methods consumed by the services
 * exercised in the 3 e2e specs.
 */
import { EventAttendanceService } from '../../src/core/events/event-attendance/event-attendance.service';
import { EventDocumentService } from '../../src/core/events/event-document/event-document.service';
import { EventFeeAssignmentService } from '../../src/core/events/event-fee-assignment/event-fee-assignment.service';
import { EventParticipantService } from '../../src/core/events/event-participant/event-participant.service';
import { EventResultService } from '../../src/core/events/event-result/event-result.service';
import { EventService } from '../../src/core/events/event/event.service';
import type {
  EventAttendanceRow,
  EventDocumentRow,
  EventFeeAssignmentRow,
  EventParticipantRow,
  EventResultRow,
  EventRow,
} from '../../src/core/events/events.types';
import { RequestContextRegistry } from '../../src/core/request-context';

const SCHOOL = 'school-1';
const USER = 'user-admin';
const NOW = new Date('2026-06-22T12:00:00.000Z');

let idSeq = 0;
const id = (p: string) => `${p}-${(++idSeq).toString().padStart(4, '0')}`;

export interface Sprint11Harness {
  readonly eventService: EventService;
  readonly participantService: EventParticipantService;
  readonly attendanceService: EventAttendanceService;
  readonly feeAssignmentService: EventFeeAssignmentService;
  readonly documentService: EventDocumentService;
  readonly resultService: EventResultService;
  readonly outbox: { publish: jest.Mock };
  readonly audit: { record: jest.Mock };
  readonly featureFlags: { isEnabled: jest.Mock };
  readonly dispatcher: { dispatch: jest.Mock };
  readonly feeInvoiceService: { generate: jest.Mock };
  readonly fileAssetService: { upload: jest.Mock; softDelete: jest.Mock };
  readonly state: HarnessState;
  outboxTopics(): string[];
  withCtx<T>(fn: () => Promise<T>): Promise<T>;
}

interface HarnessState {
  events: Map<string, EventRow>;
  participants: Map<string, EventParticipantRow>;
  attendance: EventAttendanceRow[];
  feeAssignments: Map<string, EventFeeAssignmentRow>;
  documents: Map<string, EventDocumentRow>;
  results: Map<string, EventResultRow>;
  students: Array<{ id: string; classId: string | null; sectionId: string | null }>;
}

export interface HarnessOpts {
  readonly featureFlags?: Record<string, boolean>;
}

export function createSprint11Harness(opts: HarnessOpts = {}): Sprint11Harness {
  const state: HarnessState = {
    events: new Map(),
    participants: new Map(),
    attendance: [],
    feeAssignments: new Map(),
    documents: new Map(),
    results: new Map(),
    students: [],
  };

  // ---- Outbox + audit -----------------------------------------------------
  const outboxCalls: Array<{ topic: string }> = [];
  const outbox = {
    publish: jest.fn(async (_tx: unknown, p: { topic: string }) => {
      outboxCalls.push({ topic: p.topic });
    }),
  };
  const audit = {
    record: jest.fn(async () => ({ id: id('audit'), rowHash: 'h' })),
  };

  // ---- Feature flags ------------------------------------------------------
  const flagsMap: Record<string, boolean> = {
    'module.events': true,
    'events.allow_publish': true,
    'events.allow_fee_generation': true,
    'events.allow_bulk_registration': true,
    'events.notify_on_lifecycle': true,
    ...(opts.featureFlags ?? {}),
  };
  const featureFlags = {
    isEnabled: jest.fn(async (key: string) => flagsMap[key] ?? false),
  };

  // ---- External services --------------------------------------------------
  const dispatcher = {
    dispatch: jest.fn(async () => undefined),
  };
  const feeInvoiceService = {
    generate: jest.fn(async (input: { studentIds: string[] }) => ({
      generated: input.studentIds.length,
      skipped: 0,
      invoices: input.studentIds.map((sid) => ({
        id: id('inv'),
        studentId: sid,
        lines: [],
      })),
    })),
  };
  const fileAssetService = {
    upload: jest.fn(async (input: { fileName: string; mimeType: string }) => ({
      id: id('asset'),
      storageKey: `k/${input.fileName}`,
      mimeType: input.mimeType,
    })),
    softDelete: jest.fn(async () => undefined),
  };

  // ---- Sequences ----------------------------------------------------------
  let seqVal = 0;
  const sequences = { nextValue: jest.fn(async () => ++seqVal) };

  // ---- Prisma stub --------------------------------------------------------
  // The Event service's assertTenantRefs calls tx.branch / tx.staff /
  // tx.feeHead / tx.feeStructure findMany — pass-through any provided ids
  // so the tenant guard succeeds in test scenarios.
  const passThroughFindMany = (args: { where: { id: { in: string[] } } }) =>
    Promise.resolve(args.where.id.in.map((rid) => ({ id: rid })));
  const txStub = {
    branch: { findMany: jest.fn(passThroughFindMany) },
    staff: { findMany: jest.fn(passThroughFindMany) },
    feeHead: { findMany: jest.fn(passThroughFindMany) },
    feeStructure: { findMany: jest.fn(passThroughFindMany) },
  };
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txStub)),
  };

  // ---- Event repo ---------------------------------------------------------
  const eventRepo = {
    findById: jest.fn(async (eid: string) => state.events.get(eid) ?? null),
    findActiveByCode: jest.fn(async (code: string) => {
      for (const e of state.events.values()) {
        if (e.code === code && e.deletedAt === null) return e;
      }
      return null;
    }),
    list: jest.fn(async () => ({ rows: [...state.events.values()], nextCursorId: null })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventRow = {
        id: id('evt'),
        schoolId: SCHOOL,
        code: input.code as string,
        name: input.name as string,
        description: (input.description as string | null) ?? null,
        eventType: input.eventType as EventRow['eventType'],
        category: input.category as EventRow['category'],
        subType: (input.subType as string | null) ?? null,
        status: 'DRAFT',
        startDate: input.startDate as Date,
        endDate: input.endDate as Date,
        startTime: (input.startTime as Date | null) ?? null,
        endTime: (input.endTime as Date | null) ?? null,
        timezone: (input.timezone as string) ?? 'Asia/Kolkata',
        branchId: (input.branchId as string | null) ?? null,
        venue: (input.venue as string | null) ?? null,
        organizerStaffId: (input.organizerStaffId as string | null) ?? null,
        registrationType: (input.registrationType as EventRow['registrationType']) ?? 'OPEN',
        registrationOpen: false,
        registrationOpenAt: null,
        registrationClosedAt: null,
        registrationCapacity: (input.registrationCapacity as number | null) ?? null,
        isFree: (input.isFree as boolean) ?? true,
        feeHeadId: (input.feeHeadId as string | null) ?? null,
        feeStructureId: (input.feeStructureId as string | null) ?? null,
        feeAmount: (input.feeAmount as number | null) ?? null,
        estimatedCost: (input.estimatedCost as number | null) ?? null,
        actualCost: (input.actualCost as number | null) ?? null,
        sponsorshipAmount: (input.sponsorshipAmount as number | null) ?? null,
        publishedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        registeredCount: 0,
        attendedCount: 0,
        absentCount: 0,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.events.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (eid: string, _v: number, patch: Partial<EventRow>) => {
      const cur = state.events.get(eid);
      if (!cur) throw new Error(`event ${eid} not found`);
      const next: EventRow = { ...cur, ...patch, version: cur.version + 1, updatedAt: NOW };
      state.events.set(eid, next);
      return next;
    }),
    patchStatus: jest.fn(async (eid: string, _v: number, patch: Partial<EventRow>) => {
      const cur = state.events.get(eid);
      if (!cur) throw new Error(`event ${eid} not found`);
      const next: EventRow = { ...cur, ...patch, version: cur.version + 1, updatedAt: NOW };
      state.events.set(eid, next);
      return next;
    }),
    softDelete: jest.fn(async (eid: string, _v: number) => {
      const cur = state.events.get(eid);
      if (!cur) return;
      state.events.set(eid, { ...cur, deletedAt: NOW, version: cur.version + 1 });
    }),
    bumpCounters: jest.fn(
      async (
        eid: string,
        delta: { registered?: number; attended?: number; absent?: number },
      ) => {
        const cur = state.events.get(eid);
        if (!cur) return;
        state.events.set(eid, {
          ...cur,
          registeredCount: cur.registeredCount + (delta.registered ?? 0),
          attendedCount: cur.attendedCount + (delta.attended ?? 0),
          absentCount: cur.absentCount + (delta.absent ?? 0),
        });
      },
    ),
  };

  // ---- Participant repo ---------------------------------------------------
  const participantRepo = {
    findById: jest.fn(async (pid: string) => state.participants.get(pid) ?? null),
    findActiveByEventUser: jest.fn(async (eid: string, uid: string) => {
      for (const p of state.participants.values()) {
        if (
          p.eventId === eid &&
          p.userId === uid &&
          p.deletedAt === null &&
          p.status !== 'CANCELLED' &&
          p.status !== 'REJECTED'
        ) {
          return p;
        }
      }
      return null;
    }),
    list: jest.fn(async () => ({
      rows: [...state.participants.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventParticipantRow = {
        id: id('part'),
        schoolId: SCHOOL,
        eventId: input.eventId as string,
        audience: input.audience as EventParticipantRow['audience'],
        userId: input.userId as string,
        studentId: (input.studentId as string | null) ?? null,
        staffId: (input.staffId as string | null) ?? null,
        classId: (input.classId as string | null) ?? null,
        sectionId: (input.sectionId as string | null) ?? null,
        status: input.status as EventParticipantRow['status'],
        registrationType: input.registrationType as EventParticipantRow['registrationType'],
        registeredAt: NOW,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        cancelledAt: null,
        cancellationReason: null,
        registrationSource: input.registrationSource as string,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.participants.set(row.id, row);
      return row;
    }),
    patchStatus: jest.fn(
      async (pid: string, _v: number, patch: Partial<EventParticipantRow>) => {
        const cur = state.participants.get(pid);
        if (!cur) throw new Error(`participant ${pid} not found`);
        const next: EventParticipantRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.participants.set(pid, next);
        return next;
      },
    ),
    softDelete: jest.fn(async (pid: string, _v: number) => {
      const cur = state.participants.get(pid);
      if (!cur) return;
      state.participants.set(pid, { ...cur, deletedAt: NOW, version: cur.version + 1 });
    }),
    cancelAllForEvent: jest.fn(async (eid: string, reason: string | null) => {
      let n = 0;
      for (const p of state.participants.values()) {
        if (
          p.eventId === eid &&
          p.deletedAt === null &&
          (p.status === 'PENDING' || p.status === 'REGISTERED' || p.status === 'INVITED')
        ) {
          state.participants.set(p.id, {
            ...p,
            status: 'CANCELLED',
            cancelledAt: NOW,
            cancellationReason: reason,
            version: p.version + 1,
          });
          n++;
        }
      }
      return n;
    }),
    countActiveRegisteredForEvent: jest.fn(async (eid: string) => {
      let n = 0;
      for (const p of state.participants.values()) {
        if (
          p.eventId === eid &&
          p.deletedAt === null &&
          p.status === 'REGISTERED'
        ) {
          n++;
        }
      }
      return n;
    }),
  };

  // ---- Fee assignment repo ------------------------------------------------
  const feeAssignmentRepo = {
    findById: jest.fn(async (fid: string) => state.feeAssignments.get(fid) ?? null),
    list: jest.fn(async () => ({
      rows: [...state.feeAssignments.values()],
      nextCursorId: null,
    })),
    listPendingForEvent: jest.fn(async (eid: string) => {
      return [...state.feeAssignments.values()].filter(
        (f) => f.eventId === eid && f.status === 'PENDING' && f.deletedAt === null,
      );
    }),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventFeeAssignmentRow = {
        id: id('fa'),
        schoolId: SCHOOL,
        eventId: input.eventId as string,
        participantId: input.participantId as string,
        studentId: input.studentId as string,
        feeHeadId: input.feeHeadId as string,
        feeStructureId: (input.feeStructureId as string | null) ?? null,
        amount: input.amount as number,
        status: 'PENDING',
        feeInvoiceId: null,
        invoicedAt: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.feeAssignments.set(row.id, row);
      return row;
    }),
    markInvoiced: jest.fn(async (fid: string, _v: number, invoiceId: string) => {
      const cur = state.feeAssignments.get(fid);
      if (!cur) throw new Error(`assignment ${fid} not found`);
      const next: EventFeeAssignmentRow = {
        ...cur,
        status: 'INVOICED',
        feeInvoiceId: invoiceId,
        invoicedAt: NOW,
        version: cur.version + 1,
      };
      state.feeAssignments.set(fid, next);
      return next;
    }),
    voidOne: jest.fn(
      async (fid: string, _v: number, reason: string | null) => {
        const cur = state.feeAssignments.get(fid);
        if (!cur) throw new Error(`assignment ${fid} not found`);
        const next: EventFeeAssignmentRow = {
          ...cur,
          status: 'VOID',
          voidedAt: NOW,
          voidedBy: USER,
          voidReason: reason,
          version: cur.version + 1,
        };
        state.feeAssignments.set(fid, next);
        return next;
      },
    ),
    voidAllPendingForEvent: jest.fn(async (eid: string, reason: string | null) => {
      let n = 0;
      for (const f of state.feeAssignments.values()) {
        if (f.eventId === eid && f.status === 'PENDING' && f.deletedAt === null) {
          state.feeAssignments.set(f.id, {
            ...f,
            status: 'VOID',
            voidedAt: NOW,
            voidedBy: USER,
            voidReason: reason,
            version: f.version + 1,
          });
          n++;
        }
      }
      return n;
    }),
    softDelete: jest.fn(async (fid: string, _v: number) => {
      const cur = state.feeAssignments.get(fid);
      if (!cur) return;
      state.feeAssignments.set(fid, {
        ...cur,
        deletedAt: NOW,
        version: cur.version + 1,
      });
    }),
  };

  // ---- Attendance repo ----------------------------------------------------
  const attendanceRepo = {
    append: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventAttendanceRow = {
        id: id('att'),
        schoolId: SCHOOL,
        eventId: input.eventId as string,
        participantId: input.participantId as string,
        status: input.status as EventAttendanceRow['status'],
        method: (input.method as EventAttendanceRow['method']) ?? 'MANUAL',
        occurredAt: (input.occurredAt as Date) ?? NOW,
        markedBy: (input.markedBy as string | null) ?? USER,
        deviceRef: (input.deviceRef as string | null) ?? null,
        notes: (input.notes as string | null) ?? null,
        createdAt: NOW,
        createdBy: USER,
      };
      state.attendance.push(row);
      return row;
    }),
    list: jest.fn(async () => ({
      rows: [...state.attendance],
      nextCursorId: null,
    })),
    latestPerParticipant: jest.fn(async (_eid: string) => new Map()),
    latestForParticipant: jest.fn(async (_eid: string, pid: string) => {
      const rows = state.attendance.filter((a) => a.participantId === pid);
      if (rows.length === 0) return null;
      return rows[rows.length - 1];
    }),
  };

  // ---- Document repo ------------------------------------------------------
  const documentRepo = {
    findById: jest.fn(async (did: string) => state.documents.get(did) ?? null),
    list: jest.fn(async () => ({
      rows: [...state.documents.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventDocumentRow = {
        id: id('doc'),
        schoolId: SCHOOL,
        eventId: input.eventId as string,
        fileAssetId: input.fileAssetId as string,
        documentType: input.documentType as EventDocumentRow['documentType'],
        title: input.title as string,
        description: (input.description as string | null) ?? null,
        isPublic: (input.isPublic as boolean) ?? false,
        uploadedBy: USER,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.documents.set(row.id, row);
      return row;
    }),
    softDelete: jest.fn(async (did: string, _v: number) => {
      const cur = state.documents.get(did);
      if (!cur) return;
      state.documents.set(did, { ...cur, deletedAt: NOW, version: cur.version + 1 });
    }),
  };

  // ---- Result repo --------------------------------------------------------
  const resultRepo = {
    findById: jest.fn(async (rid: string) => state.results.get(rid) ?? null),
    list: jest.fn(async () => ({
      rows: [...state.results.values()],
      nextCursorId: null,
    })),
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row: EventResultRow = {
        id: id('res'),
        schoolId: SCHOOL,
        eventId: input.eventId as string,
        participantId: input.participantId as string,
        rank: (input.rank as number | null) ?? null,
        position: input.position as EventResultRow['position'],
        score: (input.score as number | null) ?? null,
        remark: (input.remark as string | null) ?? null,
        awardedAt: null,
        awardedBy: null,
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: USER,
        updatedBy: USER,
        deletedAt: null,
        deletedBy: null,
        version: 1,
      };
      state.results.set(row.id, row);
      return row;
    }),
    update: jest.fn(
      async (rid: string, _v: number, patch: Partial<EventResultRow>) => {
        const cur = state.results.get(rid);
        if (!cur) throw new Error(`result ${rid} not found`);
        const next: EventResultRow = {
          ...cur,
          ...patch,
          version: cur.version + 1,
          updatedAt: NOW,
        };
        state.results.set(rid, next);
        return next;
      },
    ),
    softDelete: jest.fn(async (rid: string, _v: number) => {
      const cur = state.results.get(rid);
      if (!cur) return;
      state.results.set(rid, { ...cur, deletedAt: NOW, version: cur.version + 1 });
    }),
  };

  // ---- Compose services ---------------------------------------------------
  const eventService = new EventService(
    prisma as never,
    eventRepo as never,
    participantRepo as never,
    feeAssignmentRepo as never,
    sequences as never,
    featureFlags as never,
    outbox as never,
    audit as never,
    dispatcher as never,
  );
  const participantService = new EventParticipantService(
    prisma as never,
    participantRepo as never,
    eventRepo as never,
    feeAssignmentRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  const attendanceService = new EventAttendanceService(
    prisma as never,
    attendanceRepo as never,
    eventRepo as never,
    participantRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  const feeAssignmentService = new EventFeeAssignmentService(
    prisma as never,
    feeAssignmentRepo as never,
    eventRepo as never,
    feeInvoiceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  const documentService = new EventDocumentService(
    prisma as never,
    documentRepo as never,
    eventRepo as never,
    fileAssetService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  const resultService = new EventResultService(
    prisma as never,
    resultRepo as never,
    eventRepo as never,
    participantRepo as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );

  function withCtx<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = RequestContextRegistry.makeSystemContext({
      schoolId: SCHOOL,
      userId: USER,
      actorScope: 'tenant',
    });
    return RequestContextRegistry.run(ctx, fn);
  }

  return {
    eventService,
    participantService,
    attendanceService,
    feeAssignmentService,
    documentService,
    resultService,
    outbox,
    audit,
    featureFlags,
    dispatcher,
    feeInvoiceService,
    fileAssetService,
    state,
    outboxTopics(): string[] {
      return outboxCalls.map((c) => c.topic);
    },
    withCtx,
  };
}

export const TEST_SCHOOL = SCHOOL;
export const TEST_USER = USER;
export const TEST_NOW = NOW;
