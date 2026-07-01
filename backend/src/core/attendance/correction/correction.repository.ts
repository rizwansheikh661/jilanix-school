/**
 * AttendanceCorrectionRepository — pending approval queue for status edits
 * that fall outside the edit window (or that the tenant policy routes
 * through approval). Composite-PK + version-checked update via updateMany.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AttendanceCorrectionStatusValue,
  AttendanceStatusValue,
} from '../attendance.constants';
import type { AttendanceCorrectionRow } from '../attendance.types';

export interface CreateCorrectionInput {
  readonly attendanceDailyId: string;
  readonly previousStatus: AttendanceStatusValue;
  readonly newStatus: AttendanceStatusValue;
  readonly reason: string;
  readonly supportingFileId: string | null;
}

export interface ListCorrectionArgs {
  readonly status?: AttendanceCorrectionStatusValue;
  readonly attendanceDailyId?: string;
  readonly limit: number;
  readonly cursorId?: string;
}

export interface DecideCorrectionInput {
  readonly status: 'APPROVED' | 'REJECTED';
  readonly decisionReason: string | null;
}

@Injectable()
export class AttendanceCorrectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceCorrectionRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<AttendanceCorrectionRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.attendanceCorrection.findFirst({
      where: { schoolId, id },
    });
    return row === null ? null : map(row);
  }

  public async list(
    args: ListCorrectionArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AttendanceCorrectionRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId };
    if (args.status !== undefined) where.status = args.status;
    if (args.attendanceDailyId !== undefined) where.attendanceDailyId = args.attendanceDailyId;
    const rows = await reader.attendanceCorrection.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(map), nextCursorId };
  }

  public async create(
    input: CreateCorrectionInput,
    tx?: PrismaTx,
  ): Promise<AttendanceCorrectionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    if (userId === undefined) {
      throw new Error('AttendanceCorrection requires an authenticated user.');
    }
    const row = await writer.attendanceCorrection.create({
      data: {
        schoolId,
        attendanceDailyId: input.attendanceDailyId,
        requestedBy: userId,
        requestedAt: new Date(),
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        reason: input.reason,
        supportingFileId: input.supportingFileId,
        status: 'PENDING',
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return map(row);
  }

  public async decide(
    id: string,
    expectedVersion: number,
    input: DecideCorrectionInput,
    tx?: PrismaTx,
  ): Promise<AttendanceCorrectionRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.attendanceCorrection.updateMany({
      where: { schoolId, id, version: expectedVersion, status: 'PENDING' },
      data: {
        status: input.status,
        decidedBy: userId ?? null,
        decidedAt: new Date(),
        decisionReason: input.decisionReason,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('AttendanceCorrection', id, expectedVersion);
    }
    const reloaded = await writer.attendanceCorrection.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('AttendanceCorrection', id, expectedVersion);
    }
    return map(reloaded);
  }
}

interface RawCorrection {
  id: string;
  schoolId: string;
  attendanceDailyId: string;
  requestedBy: string;
  requestedAt: Date;
  previousStatus: AttendanceStatusValue;
  newStatus: AttendanceStatusValue;
  reason: string;
  supportingFileId: string | null;
  status: AttendanceCorrectionStatusValue;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawCorrection): AttendanceCorrectionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    attendanceDailyId: row.attendanceDailyId,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    reason: row.reason,
    supportingFileId: row.supportingFileId,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionReason: row.decisionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
