/**
 * StudentUserRepository — read/write access to the `student_users` junction.
 *
 * Each row represents one (Student ↔ User) pair carrying the portal-side
 * lifecycle (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED). Composite PK
 * (school_id, id) with composite FKs back into `students` and `users`
 * keeps tenant-scope at the DB layer. The two partial-uniques on
 * (school_id, *, deleted_at_key) — declared in the hand-written migration —
 * enforce strict 1:1 cardinality in both directions. The strict-unique on
 * (school_id, student_id, user_id) catches accidental re-creation of the
 * same (student, user) pair regardless of soft-delete state.
 *
 * Soft-delete is preserved alongside the canonical `status=ARCHIVED`
 * tombstone — operators can still hard-cleanup an archived row for GDPR
 * via the soft-delete column without losing history first.
 *
 * Mirrors `ParentUserRepository`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { StudentUserRow, StudentUserStatusValue } from '../student.types';

export interface CreateStudentUserInput {
  readonly studentId: string;
  readonly userId: string;
  readonly status?: StudentUserStatusValue;
  readonly invitedAt?: Date | null;
  readonly lastInviteAt?: Date | null;
}

export interface UpdateStudentUserStatusInput {
  readonly status: StudentUserStatusValue;
  readonly invitedAt?: Date | null;
  readonly activatedAt?: Date | null;
  readonly suspendedAt?: Date | null;
  readonly archivedAt?: Date | null;
  readonly lastInviteAt?: Date | null;
}

export interface ListStudentUsersArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly studentId?: string;
  readonly userId?: string;
  readonly status?: StudentUserStatusValue;
}

type Reader = PrismaTx;

@Injectable()
export class StudentUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  public async findById(id: string, tx?: PrismaTx): Promise<StudentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.studentUser.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByStudentAndUser(
    studentId: string,
    userId: string,
    tx?: PrismaTx,
  ): Promise<StudentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.studentUser.findFirst({
      where: { schoolId, studentId, userId },
    });
    return row === null ? null : mapRow(row);
  }

  public async findAliveByUserId(userId: string, tx?: PrismaTx): Promise<StudentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.studentUser.findFirst({
      where: { schoolId, userId, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findAliveByStudentId(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<StudentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.studentUser.findFirst({
      where: { schoolId, studentId, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByStudent(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<readonly StudentUserRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.studentUser.findMany({
      where: { schoolId, studentId },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async findMany(
    args: ListStudentUsersArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly StudentUserRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = { schoolId };
    if (args.studentId !== undefined) where.studentId = args.studentId;
    if (args.userId !== undefined) where.userId = args.userId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.studentUser.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? last.id : null;
    return { rows: trimmed.map(mapRow), nextCursorId };
  }

  // ------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------

  public async create(
    input: CreateStudentUserInput,
    tx?: PrismaTx,
  ): Promise<StudentUserRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.studentUser.create({
      data: {
        schoolId,
        studentId: input.studentId,
        userId: input.userId,
        status: input.status ?? 'PENDING_INVITE',
        invitedAt: input.invitedAt ?? null,
        lastInviteAt: input.lastInviteAt ?? null,
      },
    });
    return mapRow(row);
  }

  public async updateStatus(
    id: string,
    expectedVersion: number,
    patch: UpdateStudentUserStatusInput,
    tx?: PrismaTx,
  ): Promise<StudentUserRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = {
      status: patch.status,
      version: { increment: 1 },
    };
    if (patch.invitedAt !== undefined) data.invitedAt = patch.invitedAt;
    if (patch.activatedAt !== undefined) data.activatedAt = patch.activatedAt;
    if (patch.suspendedAt !== undefined) data.suspendedAt = patch.suspendedAt;
    if (patch.archivedAt !== undefined) data.archivedAt = patch.archivedAt;
    if (patch.lastInviteAt !== undefined) data.lastInviteAt = patch.lastInviteAt;

    const result = await writer.studentUser.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('StudentUser', id, expectedVersion);
    }
    const row = await writer.studentUser.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('StudentUser', id, expectedVersion);
    }
    return mapRow(row);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.studentUser.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('StudentUser', id, expectedVersion);
    }
  }

  // ------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StudentUserRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawStudentUser {
  id: string;
  schoolId: string;
  studentId: string;
  userId: string;
  status: string;
  invitedAt: Date | null;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  archivedAt: Date | null;
  lastInviteAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawStudentUser): StudentUserRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    userId: row.userId,
    status: row.status as StudentUserStatusValue,
    invitedAt: row.invitedAt,
    activatedAt: row.activatedAt,
    suspendedAt: row.suspendedAt,
    archivedAt: row.archivedAt,
    lastInviteAt: row.lastInviteAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
