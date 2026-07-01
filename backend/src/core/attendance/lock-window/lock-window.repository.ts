/**
 * AttendanceLockWindowRepository — persistence for date-range locks that
 * freeze attendance writes. Soft-delete (`deletedAt`) doubles as "unlocked":
 * an unlock just stamps `deletedAt`/`deletedBy`/bumps version, and read
 * queries filter it out.
 *
 * Scope precedence (interpreted by service): SCHOOL > BRANCH > SECTION.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { AttendanceLockScopeValue } from '../attendance.constants';
import type { AttendanceLockWindowRow } from '../attendance.types';

export interface CreateLockWindowInput {
  readonly scope: AttendanceLockScopeValue;
  readonly branchId: string | null;
  readonly sectionId: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string | null;
}

export interface ListLockWindowArgs {
  readonly scope?: AttendanceLockScopeValue;
  readonly branchId?: string;
  readonly sectionId?: string;
  readonly activeOn?: Date;
}

@Injectable()
export class AttendanceLockWindowRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AttendanceLockWindowRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<AttendanceLockWindowRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.attendanceLockWindow.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : map(row);
  }

  public async list(
    args: ListLockWindowArgs = {},
    tx?: PrismaTx,
  ): Promise<readonly AttendanceLockWindowRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.scope !== undefined) where.scope = args.scope;
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.activeOn !== undefined) {
      where.startDate = { lte: args.activeOn };
      where.endDate = { gte: args.activeOn };
    }
    const rows = await reader.attendanceLockWindow.findMany({
      where,
      orderBy: [{ startDate: 'desc' }],
    });
    return rows.map(map);
  }

  /**
   * Find active locks for a `(branchId, sectionId, date)` triple, applying
   * scope precedence: a SCHOOL lock covers everything, a BRANCH lock covers
   * sections in that branch, a SECTION lock covers only its section.
   */
  public async findActive(
    branchId: string | null,
    sectionId: string | null,
    date: Date,
    tx?: PrismaTx,
  ): Promise<readonly AttendanceLockWindowRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const orClauses: Record<string, unknown>[] = [{ scope: 'SCHOOL' }];
    if (branchId !== null) {
      orClauses.push({ scope: 'BRANCH', branchId });
    }
    if (sectionId !== null) {
      orClauses.push({ scope: 'SECTION', sectionId });
    }
    const rows = await reader.attendanceLockWindow.findMany({
      where: {
        schoolId,
        deletedAt: null,
        startDate: { lte: date },
        endDate: { gte: date },
        OR: orClauses,
      },
    });
    return rows.map(map);
  }

  public async create(
    input: CreateLockWindowInput,
    tx?: PrismaTx,
  ): Promise<AttendanceLockWindowRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const now = new Date();
    const row = await writer.attendanceLockWindow.create({
      data: {
        schoolId,
        scope: input.scope,
        branchId: input.branchId,
        sectionId: input.sectionId,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        lockedBy: userId ?? null,
        lockedAt: now,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  /** Soft-delete = unlock. Version-checked to prevent stale unlocks. */
  public async unlock(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.attendanceLockWindow.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('AttendanceLockWindow', id, expectedVersion);
    }
  }
}

interface RawLock {
  id: string;
  schoolId: string;
  scope: AttendanceLockScopeValue;
  branchId: string | null;
  sectionId: string | null;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  lockedBy: string | null;
  lockedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawLock): AttendanceLockWindowRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    scope: row.scope,
    branchId: row.branchId,
    sectionId: row.sectionId,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
