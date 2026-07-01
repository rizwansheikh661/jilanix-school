/**
 * StaffLeaveRepository — read/write access to `staff_leaves`. Optimistic
 * locking via `version`; soft-delete supported. State transitions are
 * enforced in `StaffLeaveService`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { LeaveStatusValue, LeaveTypeValue, StaffLeaveRow } from '../staff.types';

export interface CreateStaffLeaveInput {
  readonly staffId: string;
  readonly leaveType: LeaveTypeValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly days: number;
  readonly reason: string;
}

export interface UpdateStaffLeaveInput {
  readonly leaveType?: LeaveTypeValue;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly days?: number;
  readonly reason?: string;
}

export interface ListStaffLeaveArgs {
  readonly staffId: string;
  readonly status?: LeaveStatusValue;
}

type Reader = PrismaTx;

@Injectable()
export class StaffLeaveRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<StaffLeaveRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staffLeave.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListStaffLeaveArgs,
    tx?: PrismaTx,
  ): Promise<readonly StaffLeaveRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const where: Record<string, unknown> = {
      schoolId,
      staffId: args.staffId,
      deletedAt: null,
    };
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.staffLeave.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapRow);
  }

  public async create(input: CreateStaffLeaveInput, tx?: PrismaTx): Promise<StaffLeaveRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.staffLeave.create({
      data: {
        schoolId,
        staffId: input.staffId,
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        days: input.days,
        reason: input.reason,
        status: 'DRAFT',
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateStaffLeaveInput,
    tx?: PrismaTx,
  ): Promise<StaffLeaveRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    const keys: ReadonlyArray<keyof UpdateStaffLeaveInput> = [
      'leaveType',
      'startDate',
      'endDate',
      'days',
      'reason',
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) {
        data[k] = patch[k];
      }
    }
    const result = await writer.staffLeave.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('StaffLeave', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async transitionStatus(
    id: string,
    expectedVersion: number,
    status: LeaveStatusValue,
    decision: { readonly decidedBy?: string | null; readonly decisionNote?: string | null } = {},
    tx?: PrismaTx,
  ): Promise<StaffLeaveRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { status, version: { increment: 1 } };
    if (status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED') {
      data.decidedBy = decision.decidedBy ?? null;
      data.decidedAt = new Date();
      data.decisionNote = decision.decisionNote ?? null;
    }
    const result = await writer.staffLeave.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('StaffLeave', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<StaffLeaveRow> {
    const row = await reader.staffLeave.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('StaffLeave', id, expectedVersion);
    }
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StaffLeaveRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  staffId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: unknown; // Prisma Decimal
  reason: string;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawRow): StaffLeaveRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    staffId: row.staffId,
    leaveType: row.leaveType as LeaveTypeValue,
    startDate: row.startDate,
    endDate: row.endDate,
    days: Number(row.days),
    reason: row.reason,
    status: row.status as LeaveStatusValue,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
