/**
 * AssignmentSubmissionRepository — persistence for `assignment_submissions`.
 *
 * Unique on `(schoolId, assignmentId, studentId)` enforced via STORED
 * `deleted_at_key` partial unique in migration. Repository surfaces standard
 * CRUD + status-patch + a guarded "find active submission for student" helper
 * used to short-circuit duplicate POST attempts before the unique fires.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SubmissionStatusValue } from '../academic-content.constants';
import type { AssignmentSubmissionRow } from '../academic-content.types';

export interface CreateSubmissionInput {
  readonly assignmentId: string;
  readonly studentId: string;
  readonly submittedAt: Date;
  readonly isLate: boolean;
  readonly status: SubmissionStatusValue;
  readonly recordedByStaffId?: string | null;
  readonly remarks?: string | null;
}

export interface UpdateSubmissionInput {
  readonly status?: SubmissionStatusValue;
  readonly marksObtained?: number | null;
  readonly evaluatedAt?: Date | null;
  readonly evaluatedByStaffId?: string | null;
  readonly evaluationRemarks?: string | null;
  readonly rejectedAt?: Date | null;
  readonly rejectionReason?: string | null;
}

export interface ListSubmissionArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly assignmentId?: string;
  readonly studentId?: string;
  readonly status?: SubmissionStatusValue;
  readonly isLate?: boolean;
  readonly evaluatedByStaffId?: string;
}

@Injectable()
export class AssignmentSubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AssignmentSubmissionRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AssignmentSubmissionRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.assignmentSubmission.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawSubmission);
  }

  public async findActiveForStudent(
    assignmentId: string,
    studentId: string,
    tx?: PrismaTx,
  ): Promise<AssignmentSubmissionRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.assignmentSubmission.findFirst({
      where: { schoolId, assignmentId, studentId, deletedAt: null },
    });
    return row === null ? null : mapRow(row as unknown as RawSubmission);
  }

  public async list(
    args: ListSubmissionArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly AssignmentSubmissionRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.assignmentId !== undefined) where.assignmentId = args.assignmentId;
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.status !== undefined) where.status = args.status;
    if (args.isLate !== undefined) where.isLate = args.isLate;
    if (args.evaluatedByStaffId !== undefined) {
      where.evaluatedByStaffId = args.evaluatedByStaffId;
    }
    const rows = await reader.assignmentSubmission.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawSubmission)),
      nextCursorId,
    };
  }

  public async create(
    input: CreateSubmissionInput,
    tx?: PrismaTx,
  ): Promise<AssignmentSubmissionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.assignmentSubmission.create({
      data: {
        schoolId,
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        submittedAt: input.submittedAt,
        isLate: input.isLate,
        status: input.status,
        recordedByStaffId: input.recordedByStaffId ?? null,
        remarks: input.remarks ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created as unknown as RawSubmission);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateSubmissionInput,
    tx?: PrismaTx,
  ): Promise<AssignmentSubmissionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.status !== undefined) data.status = input.status;
    if (input.marksObtained !== undefined) data.marksObtained = input.marksObtained;
    if (input.evaluatedAt !== undefined) data.evaluatedAt = input.evaluatedAt;
    if (input.evaluatedByStaffId !== undefined) {
      data.evaluatedByStaffId = input.evaluatedByStaffId;
    }
    if (input.evaluationRemarks !== undefined) {
      data.evaluationRemarks = input.evaluationRemarks;
    }
    if (input.rejectedAt !== undefined) data.rejectedAt = input.rejectedAt;
    if (input.rejectionReason !== undefined) {
      data.rejectionReason = input.rejectionReason;
    }
    const result = await writer.assignmentSubmission.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('AssignmentSubmission', id, expectedVersion);
    }
    const reloaded = await writer.assignmentSubmission.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('AssignmentSubmission', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawSubmission);
  }
}

interface RawSubmission {
  id: string;
  schoolId: string;
  assignmentId: string;
  studentId: string;
  submittedAt: Date;
  isLate: boolean;
  status: string;
  recordedByStaffId: string | null;
  remarks: string | null;
  marksObtained: unknown;
  evaluatedAt: Date | null;
  evaluatedByStaffId: string | null;
  evaluationRemarks: string | null;
  rubricSnapshot: unknown;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function decimalToNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof (v as { toString?: () => string }).toString === 'function') {
    return Number((v as { toString: () => string }).toString());
  }
  return null;
}

function mapRow(row: RawSubmission): AssignmentSubmissionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    submittedAt: row.submittedAt,
    isLate: row.isLate,
    status: row.status as AssignmentSubmissionRow['status'],
    recordedByStaffId: row.recordedByStaffId,
    remarks: row.remarks,
    marksObtained: decimalToNumberOrNull(row.marksObtained),
    evaluatedAt: row.evaluatedAt,
    evaluatedByStaffId: row.evaluatedByStaffId,
    evaluationRemarks: row.evaluationRemarks,
    rubricSnapshot: row.rubricSnapshot ?? null,
    rejectedAt: row.rejectedAt,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
