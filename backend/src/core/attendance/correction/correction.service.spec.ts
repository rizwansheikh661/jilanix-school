/**
 * AttendanceCorrectionService unit specs — covers create snapshot of
 * previousStatus, the approve/reject decide() workflow, the rule that
 * non-PENDING corrections cannot be re-decided, and the cross-service hook
 * that applies the new status to AttendanceDaily on approval.
 */
import { RequestContextRegistry } from '../../request-context';
import { AttendanceCorrectionService } from './correction.service';
import { AttendanceCorrectionRepository } from './correction.repository';
import { AttendanceDailyRepository } from '../student-attendance/attendance-daily.repository';
import { StudentAttendanceService } from '../student-attendance/student-attendance.service';
import {
  AttendanceCorrectionNotFoundError,
  AttendanceNotFoundError,
  CorrectionAlreadyDecidedError,
} from '../attendance.errors';
import type { AttendanceCorrectionRow, AttendanceDailyRow } from '../attendance.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

const SCHOOL = 'sch-1';
const NOW = new Date(Date.UTC(2026, 5, 19));

function makeAttendance(): AttendanceDailyRow {
  return {
    id: 'att-1', schoolId: SCHOOL, branchId: 'br-1', academicYearId: 'ay-1',
    sectionId: 'sec-1', studentId: 'stu-1', date: NOW, status: 'ABSENT',
    source: 'MANUAL', markedAt: NOW, markedBy: null,
    checkInTime: null, checkOutTime: null, remarks: null,
    mode: 'DAILY', periodNumber: null, subjectId: null,
    version: 1, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null,
  };
}

function makeCorrection(overrides: Partial<AttendanceCorrectionRow> = {}): AttendanceCorrectionRow {
  return {
    id: 'corr-1', schoolId: SCHOOL, attendanceDailyId: 'att-1',
    requestedBy: 'usr-1', requestedAt: NOW,
    previousStatus: 'ABSENT', newStatus: 'PRESENT', reason: 'parent letter',
    supportingFileId: null, status: 'PENDING',
    decidedBy: null, decidedAt: null, decisionReason: null,
    version: 1, createdAt: NOW, updatedAt: NOW, createdBy: null, updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<AttendanceCorrectionRepository> = {
    findById: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    decide: jest.fn(),
  } as unknown as Mocked<AttendanceCorrectionRepository>;
  const attendanceRepo: Mocked<AttendanceDailyRepository> = {
    findById: jest.fn(),
  } as unknown as Mocked<AttendanceDailyRepository>;
  const studentAttendance: Mocked<StudentAttendanceService> = {
    applyCorrectedStatus: jest.fn(async () => makeAttendance()),
  } as unknown as Mocked<StudentAttendanceService>;
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'aud-1', rowHash: 'h' })) };
  const svc = new AttendanceCorrectionService(
    prisma as never, repo as never, attendanceRepo as never,
    studentAttendance as never, outbox as never, audit as never,
  );
  return { svc, prisma, repo, attendanceRepo, studentAttendance, outbox, audit };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

describe('AttendanceCorrectionService.create', () => {
  it('throws NotFound when target attendance is missing', async () => {
    const t = makeService();
    t.attendanceRepo.findById.mockResolvedValue(null);
    await expect(
      withCtx(() => t.svc.create({ attendanceDailyId: 'att-1', newStatus: 'PRESENT', reason: 'r' })),
    ).rejects.toBeInstanceOf(AttendanceNotFoundError);
  });

  it('snapshots previousStatus from the current attendance row', async () => {
    const t = makeService();
    t.attendanceRepo.findById.mockResolvedValue(makeAttendance());
    t.repo.create.mockResolvedValue(makeCorrection());
    await withCtx(() => t.svc.create({ attendanceDailyId: 'att-1', newStatus: 'PRESENT', reason: 'r' }));
    expect(t.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ previousStatus: 'ABSENT', newStatus: 'PRESENT' }),
      expect.anything(),
    );
  });
});

describe('AttendanceCorrectionService.decide', () => {
  it('throws NotFound for missing correction', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(withCtx(() => t.svc.approve('corr-1', 1, null)))
      .rejects.toBeInstanceOf(AttendanceCorrectionNotFoundError);
  });

  it('throws CorrectionAlreadyDecidedError when status is not PENDING', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCorrection({ status: 'APPROVED' }));
    await expect(withCtx(() => t.svc.approve('corr-1', 1, null)))
      .rejects.toBeInstanceOf(CorrectionAlreadyDecidedError);
  });

  it('approve applies the new status to AttendanceDaily in the same tx', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCorrection());
    t.repo.decide.mockResolvedValue(makeCorrection({ status: 'APPROVED', version: 2 }));
    await withCtx(() => t.svc.approve('corr-1', 1, 'ok'));
    expect(t.studentAttendance.applyCorrectedStatus).toHaveBeenCalledWith(
      'att-1', 'PRESENT', 'corr-1', 'parent letter', expect.anything(),
    );
  });

  it('reject does NOT touch AttendanceDaily and publishes a rejection event', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeCorrection());
    t.repo.decide.mockResolvedValue(makeCorrection({ status: 'REJECTED', version: 2 }));
    await withCtx(() => t.svc.reject('corr-1', 1, 'insufficient'));
    expect(t.studentAttendance.applyCorrectedStatus).not.toHaveBeenCalled();
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'AttendanceCorrectionRejected' }),
    );
  });
});
