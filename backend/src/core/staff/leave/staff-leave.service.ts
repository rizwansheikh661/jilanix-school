/**
 * StaffLeaveService — DRAFT → SUBMITTED → APPROVED|REJECTED|CANCELLED state
 * machine. UPDATE only permitted in DRAFT; APPROVE/REJECT only from
 * SUBMITTED; CANCEL allowed from DRAFT or SUBMITTED. Each terminal
 * transition stamps `decidedBy` from the request context.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { StaffRepository } from '../repositories/staff.repository';
import {
  StaffLeaveRepository,
  type CreateStaffLeaveInput,
  type ListStaffLeaveArgs,
  type UpdateStaffLeaveInput,
} from '../repositories/staff-leave.repository';
import {
  LeaveDatesInvalidError,
  LeaveDaysInvalidError,
  LeaveInvalidStateTransitionError,
} from '../staff.errors';
import type { LeaveStatusValue, LeaveTypeValue, StaffLeaveRow } from '../staff.types';

export interface CreateStaffLeaveArgs {
  readonly leaveType: LeaveTypeValue;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly days: number;
  readonly reason: string;
}

export interface UpdateStaffLeaveArgs {
  readonly leaveType?: LeaveTypeValue;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly days?: number;
  readonly reason?: string;
}

@Injectable()
export class StaffLeaveService {
  private readonly logger = new Logger(StaffLeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly repo: StaffLeaveRepository,
  ) {}

  public async list(args: ListStaffLeaveArgs): Promise<readonly StaffLeaveRow[]> {
    const staff = await this.staffRepo.findById(args.staffId);
    if (staff === null) throw new NotFoundError('Staff', args.staffId);
    return this.repo.findMany(args);
  }

  public async getById(staffId: string, leaveId: string): Promise<StaffLeaveRow> {
    const row = await this.requireScoped(staffId, leaveId);
    return row;
  }

  public async create(staffId: string, args: CreateStaffLeaveArgs): Promise<StaffLeaveRow> {
    this.assertDates(args.startDate, args.endDate);
    this.assertDays(args.days);
    return this.prisma.transaction(async (tx) => {
      const staff = await this.staffRepo.findById(staffId, tx);
      if (staff === null) throw new NotFoundError('Staff', staffId);
      const input: CreateStaffLeaveInput = {
        staffId,
        leaveType: args.leaveType,
        startDate: args.startDate,
        endDate: args.endDate,
        days: args.days,
        reason: args.reason,
      };
      const row = await this.repo.create(input, tx);
      this.logger.log(`Created leave ${row.id} for Staff ${staffId} (DRAFT).`);
      return row;
    });
  }

  public async update(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
    args: UpdateStaffLeaveArgs,
  ): Promise<StaffLeaveRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.requireScoped(staffId, leaveId, tx);
      if (row.status !== 'DRAFT') {
        throw new LeaveInvalidStateTransitionError({
          leaveId,
          currentStatus: row.status,
          attemptedAction: 'update',
        });
      }
      const nextStart = args.startDate ?? row.startDate;
      const nextEnd = args.endDate ?? row.endDate;
      this.assertDates(nextStart, nextEnd);
      if (args.days !== undefined) this.assertDays(args.days);
      const patch: UpdateStaffLeaveInput = {
        ...(args.leaveType !== undefined ? { leaveType: args.leaveType } : {}),
        ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
        ...(args.endDate !== undefined ? { endDate: args.endDate } : {}),
        ...(args.days !== undefined ? { days: args.days } : {}),
        ...(args.reason !== undefined ? { reason: args.reason } : {}),
      };
      return this.repo.update(leaveId, expectedVersion, patch, tx);
    });
  }

  public async submit(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
  ): Promise<StaffLeaveRow> {
    return this.transition(staffId, leaveId, expectedVersion, 'SUBMITTED', 'submit', ['DRAFT']);
  }

  public async approve(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
    note: string | null,
  ): Promise<StaffLeaveRow> {
    return this.transition(
      staffId,
      leaveId,
      expectedVersion,
      'APPROVED',
      'approve',
      ['SUBMITTED'],
      note,
    );
  }

  public async reject(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
    note: string | null,
  ): Promise<StaffLeaveRow> {
    return this.transition(
      staffId,
      leaveId,
      expectedVersion,
      'REJECTED',
      'reject',
      ['SUBMITTED'],
      note,
    );
  }

  public async cancel(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
    note: string | null,
  ): Promise<StaffLeaveRow> {
    return this.transition(
      staffId,
      leaveId,
      expectedVersion,
      'CANCELLED',
      'cancel',
      ['DRAFT', 'SUBMITTED'],
      note,
    );
  }

  private async transition(
    staffId: string,
    leaveId: string,
    expectedVersion: number,
    target: LeaveStatusValue,
    actionLabel: string,
    allowedFrom: readonly LeaveStatusValue[],
    note: string | null = null,
  ): Promise<StaffLeaveRow> {
    return this.prisma.transaction(async (tx) => {
      const row = await this.requireScoped(staffId, leaveId, tx);
      if (!allowedFrom.includes(row.status)) {
        throw new LeaveInvalidStateTransitionError({
          leaveId,
          currentStatus: row.status,
          attemptedAction: actionLabel,
        });
      }
      const ctx = RequestContextRegistry.require();
      const updated = await this.repo.transitionStatus(
        leaveId,
        expectedVersion,
        target,
        {
          decidedBy: ctx.userId ?? null,
          decisionNote: note,
        },
        tx,
      );
      this.logger.log(`Leave ${leaveId} → ${target} (Staff ${staffId}).`);
      return updated;
    });
  }

  private async requireScoped(
    staffId: string,
    leaveId: string,
    tx?: Parameters<Parameters<PrismaService['transaction']>[0]>[0],
  ): Promise<StaffLeaveRow> {
    const row = await this.repo.findById(leaveId, tx);
    if (row === null || row.staffId !== staffId) {
      throw new NotFoundError('StaffLeave', leaveId);
    }
    return row;
  }

  private assertDates(start: Date, end: Date): void {
    if (end.getTime() < start.getTime()) throw new LeaveDatesInvalidError();
  }

  private assertDays(days: number): void {
    if (!(days > 0 && days <= 366)) throw new LeaveDaysInvalidError();
  }
}
