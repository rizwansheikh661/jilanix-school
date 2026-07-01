/**
 * ParentUserRepository — read/write access to the `parent_users` junction.
 *
 * Each row represents one (Parent ↔ User ↔ relation) tuple carrying the
 * portal-side lifecycle (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED).
 * Composite PK (school_id, id) with composite FKs back into `parents` and
 * `users` keeps tenant-scope at the DB layer. The partial-unique on
 * (school_id, user_id, deleted_at_key) — declared in the hand-written
 * migration — enforces "one alive User → one Parent family"; the
 * strict-unique on (school_id, parent_id, user_id) prevents accidental
 * duplicate links inside the same family (alive or not).
 *
 * Soft-delete is preserved alongside the canonical `status=ARCHIVED`
 * tombstone — operators can still hard-cleanup an archived row for GDPR
 * via the soft-delete column without losing history first.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ParentRelationValue,
  ParentUserRow,
  ParentUserStatusValue,
} from '../parent.types';

export interface CreateParentUserInput {
  readonly parentId: string;
  readonly userId: string;
  readonly relation: ParentRelationValue;
  readonly status?: ParentUserStatusValue;
  readonly invitedAt?: Date | null;
  readonly lastInviteAt?: Date | null;
}

export interface UpdateParentUserStatusInput {
  readonly status: ParentUserStatusValue;
  readonly invitedAt?: Date | null;
  readonly activatedAt?: Date | null;
  readonly suspendedAt?: Date | null;
  readonly archivedAt?: Date | null;
  readonly lastInviteAt?: Date | null;
}

export interface ListParentUsersArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly parentId?: string;
  readonly userId?: string;
  readonly status?: ParentUserStatusValue;
}

type Reader = PrismaTx;

@Injectable()
export class ParentUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  public async findById(id: string, tx?: PrismaTx): Promise<ParentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.parentUser.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByParentAndUser(
    parentId: string,
    userId: string,
    tx?: PrismaTx,
  ): Promise<ParentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.parentUser.findFirst({
      where: { schoolId, parentId, userId },
    });
    return row === null ? null : mapRow(row);
  }

  public async findAliveByUserId(userId: string, tx?: PrismaTx): Promise<ParentUserRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.parentUser.findFirst({
      where: { schoolId, userId, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByParent(
    parentId: string,
    tx?: PrismaTx,
  ): Promise<readonly ParentUserRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.parentUser.findMany({
      where: { schoolId, parentId },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async findMany(
    args: ListParentUsersArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ParentUserRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = { schoolId };
    if (args.parentId !== undefined) where.parentId = args.parentId;
    if (args.userId !== undefined) where.userId = args.userId;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.parentUser.findMany({
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
    input: CreateParentUserInput,
    tx?: PrismaTx,
  ): Promise<ParentUserRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.parentUser.create({
      data: {
        schoolId,
        parentId: input.parentId,
        userId: input.userId,
        relation: input.relation,
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
    patch: UpdateParentUserStatusInput,
    tx?: PrismaTx,
  ): Promise<ParentUserRow> {
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

    const result = await writer.parentUser.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ParentUser', id, expectedVersion);
    }
    const row = await writer.parentUser.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('ParentUser', id, expectedVersion);
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
    const result = await writer.parentUser.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ParentUser', id, expectedVersion);
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
      throw new Error('ParentUserRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawParentUser {
  id: string;
  schoolId: string;
  parentId: string;
  userId: string;
  relation: string;
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

function mapRow(row: RawParentUser): ParentUserRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    parentId: row.parentId,
    userId: row.userId,
    relation: row.relation as ParentRelationValue,
    status: row.status as ParentUserStatusValue,
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
