/**
 * UserRoleRepository — assignment table reads and writes.
 *
 * The model is TENANT_OWNED so the tenantScopeExt already injects the
 * caller's `schoolId` on reads. We still pass `schoolId` explicitly on
 * mutations because writes need to satisfy the composite primary key
 * `(school_id, id)`.
 *
 * "Active" assignments are: `revokedAt IS NULL AND (expiresAt IS NULL
 * OR expiresAt > now())`. The strategy uses `listActiveRoleIdsForUser`
 * on every authenticated request, so the index `ix_user_roles_user_revoked`
 * lets that be a single B-tree probe.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { UserRoleRow } from '../rbac.types';

export interface AssignRoleInput {
  readonly schoolId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedBy?: string;
  readonly expiresAt?: Date | null;
}

@Injectable()
export class UserRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  /**
   * Returns the role IDs currently active for this user. Drives the JWT
   * `role_ids` claim — runs once per login + once per refresh, NOT on
   * every authenticated request (that would be a roundtrip per request).
   */
  public async listActiveRoleIdsForUser(
    args: { schoolId: string; userId: string },
    tx?: PrismaTx,
  ): Promise<readonly string[]> {
    const reader = this.resolve(tx);
    const now = new Date();
    const rows = await reader.userRole.findMany({
      where: {
        schoolId: args.schoolId,
        userId: args.userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { roleId: true },
      orderBy: { roleId: 'asc' },
    });
    return rows.map((r: { roleId: string }) => r.roleId);
  }

  /** All assignments for a user (active + historical). Admin/audit use. */
  public async listAllForUser(
    args: { schoolId: string; userId: string },
    tx?: PrismaTx,
  ): Promise<readonly UserRoleRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.userRole.findMany({
      where: { schoolId: args.schoolId, userId: args.userId },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map(mapUserRole);
  }

  public async findActiveAssignment(
    args: { schoolId: string; userId: string; roleId: string },
    tx?: PrismaTx,
  ): Promise<UserRoleRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.userRole.findFirst({
      where: {
        schoolId: args.schoolId,
        userId: args.userId,
        roleId: args.roleId,
        revokedAt: null,
      },
    });
    return row === null ? null : mapUserRole(row);
  }

  /**
   * Idempotent assignment. If a non-revoked row already exists, we update
   * `expiresAt` / `assignedBy` (extending an existing grant) rather than
   * creating a duplicate (which would trip the `(schoolId,userId,roleId)`
   * unique index anyway).
   */
  public async assign(input: AssignRoleInput, tx?: PrismaTx): Promise<UserRoleRow> {
    const writer = this.resolve(tx);
    const row = await writer.userRole.upsert({
      where: {
        schoolId_userId_roleId: {
          schoolId: input.schoolId,
          userId: input.userId,
          roleId: input.roleId,
        },
      },
      create: {
        schoolId: input.schoolId,
        userId: input.userId,
        roleId: input.roleId,
        assignedBy: input.assignedBy ?? null,
        expiresAt: input.expiresAt ?? null,
        createdBy: input.assignedBy ?? null,
        updatedBy: input.assignedBy ?? null,
      },
      update: {
        revokedAt: null,
        revokedBy: null,
        expiresAt: input.expiresAt ?? null,
        assignedBy: input.assignedBy ?? null,
        assignedAt: new Date(),
        updatedBy: input.assignedBy ?? null,
      },
    });
    return mapUserRole(row);
  }

  /**
   * Soft-revoke. We never DELETE a UserRole row in normal flow — the
   * audit trail of "who held what role when" is part of the compliance
   * surface. `assign()` flips `revokedAt` back to null on re-assignment.
   */
  public async revoke(
    args: { schoolId: string; userId: string; roleId: string; revokedBy?: string; at?: Date },
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const result = await writer.userRole.updateMany({
      where: {
        schoolId: args.schoolId,
        userId: args.userId,
        roleId: args.roleId,
        revokedAt: null,
      },
      data: {
        revokedAt: args.at ?? new Date(),
        revokedBy: args.revokedBy ?? null,
        updatedBy: args.revokedBy ?? null,
      },
    });
    return result.count;
  }

  /** Revoke every active assignment for a user — used on user disable. */
  public async revokeAllForUser(
    args: { schoolId: string; userId: string; revokedBy?: string; at?: Date },
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const result = await writer.userRole.updateMany({
      where: { schoolId: args.schoolId, userId: args.userId, revokedAt: null },
      data: {
        revokedAt: args.at ?? new Date(),
        revokedBy: args.revokedBy ?? null,
        updatedBy: args.revokedBy ?? null,
      },
    });
    return result.count;
  }
}

function mapUserRole(row: {
  id: string;
  schoolId: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}): UserRoleRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    roleId: row.roleId,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy,
  };
}
