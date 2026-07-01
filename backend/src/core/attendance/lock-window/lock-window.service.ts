/**
 * AttendanceLockWindowService — create/list/unlock + the `assertNotLocked`
 * gate used by writers (student / staff / correction approval).
 *
 * Scope rules enforced at create time:
 *   SCHOOL   → branchId/sectionId MUST be null
 *   BRANCH   → branchId required, sectionId null
 *   SECTION  → sectionId required (branchId may be null until branch derivation lands)
 *
 * Outbox events: `attendance.locked` on create, `attendance.unlocked` on
 * delete — published inside the same tx as the row write.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { AttendanceOutboxTopics, type AttendanceLockScopeValue } from '../attendance.constants';
import {
  AttendanceLockedError,
  AttendanceLockNotFoundError,
  LockScopeArgumentError,
} from '../attendance.errors';
import type { AttendanceLockWindowRow } from '../attendance.types';
import {
  AttendanceLockWindowRepository,
  type CreateLockWindowInput,
  type ListLockWindowArgs,
} from './lock-window.repository';

export interface CreateLockWindowArgs {
  readonly scope: AttendanceLockScopeValue;
  readonly branchId?: string | null;
  readonly sectionId?: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason?: string | null;
}

@Injectable()
export class AttendanceLockWindowService {
  private readonly logger = new Logger(AttendanceLockWindowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AttendanceLockWindowRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListLockWindowArgs = {}): Promise<readonly AttendanceLockWindowRow[]> {
    return this.repo.list(args);
  }

  public async getById(id: string): Promise<AttendanceLockWindowRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new AttendanceLockNotFoundError(id);
    return row;
  }

  public async create(args: CreateLockWindowArgs): Promise<AttendanceLockWindowRow> {
    const input = this.validateScope(args);
    if (input.startDate.getTime() > input.endDate.getTime()) {
      throw new LockScopeArgumentError(
        'startDate must be on or before endDate.',
        args.scope,
      );
    }
    return this.prisma.transaction(async (tx) => {
      const row = await this.repo.create(input, tx);
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.LOCKED,
        eventType: 'AttendanceLockWindowCreated',
        aggregateType: 'AttendanceLockWindow',
        aggregateId: row.id,
        payload: {
          id: row.id,
          scope: row.scope,
          branchId: row.branchId,
          sectionId: row.sectionId,
          startDate: row.startDate.toISOString().slice(0, 10),
          endDate: row.endDate.toISOString().slice(0, 10),
        },
      });
      await this.audit.record(
        {
          action: 'attendance_lock_window.create',
          category: 'general',
          resourceType: 'AttendanceLockWindow',
          resourceId: row.id,
          after: row,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(
        `Attendance lock created id=${row.id} scope=${row.scope} ${row.startDate.toISOString().slice(0, 10)}→${row.endDate.toISOString().slice(0, 10)}.`,
      );
      return row;
    });
  }

  public async unlock(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (existing === null) throw new AttendanceLockNotFoundError(id);
      await this.repo.unlock(id, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: AttendanceOutboxTopics.UNLOCKED,
        eventType: 'AttendanceLockWindowDeleted',
        aggregateType: 'AttendanceLockWindow',
        aggregateId: id,
        payload: {
          id,
          scope: existing.scope,
          branchId: existing.branchId,
          sectionId: existing.sectionId,
        },
      });
      await this.audit.record(
        {
          action: 'attendance_lock_window.delete',
          category: 'general',
          resourceType: 'AttendanceLockWindow',
          resourceId: id,
          before: existing,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`Attendance lock unlocked id=${id}.`);
    });
  }

  /**
   * Gate for writers. Throws `AttendanceLockedError` if any active lock
   * covers the `(branchId, sectionId, date)` triple. Pre-existing tx is
   * required so the check is consistent with the write.
   */
  public async assertNotLocked(
    branchId: string | null,
    sectionId: string | null,
    date: Date,
    tx: PrismaTx,
  ): Promise<void> {
    const active = await this.repo.findActive(branchId, sectionId, date, tx);
    if (active.length === 0) return;
    const first = active[0];
    if (first === undefined) return;
    throw new AttendanceLockedError(date, first.id);
  }

  private validateScope(args: CreateLockWindowArgs): CreateLockWindowInput {
    const branchId = args.branchId ?? null;
    const sectionId = args.sectionId ?? null;
    switch (args.scope) {
      case 'SCHOOL':
        if (branchId !== null || sectionId !== null) {
          throw new LockScopeArgumentError(
            'SCHOOL scope must not carry branchId or sectionId.',
            args.scope,
          );
        }
        break;
      case 'BRANCH':
        if (branchId === null) {
          throw new LockScopeArgumentError(
            'BRANCH scope requires branchId.',
            args.scope,
          );
        }
        if (sectionId !== null) {
          throw new LockScopeArgumentError(
            'BRANCH scope must not carry sectionId.',
            args.scope,
          );
        }
        break;
      case 'SECTION':
        if (sectionId === null) {
          throw new LockScopeArgumentError(
            'SECTION scope requires sectionId.',
            args.scope,
          );
        }
        break;
    }
    return {
      scope: args.scope,
      branchId,
      sectionId,
      startDate: args.startDate,
      endDate: args.endDate,
      reason: args.reason ?? null,
    };
  }
}
