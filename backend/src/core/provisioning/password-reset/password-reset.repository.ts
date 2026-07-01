/**
 * PasswordResetRepository — write + read paths over `password_reset_requests`.
 *
 * Tokens are stored as a SHA-256 hex hash; cleartext never touches the DB.
 * The lookup-by-token-hash bypasses tenant scope because the request is
 * issued anonymously — we don't know the tenant until after the hash hits.
 *
 * All writes/reads accept an optional `PrismaTx` so callers (PasswordReset-
 * Service, AuthService) can compose them into outbox-publishing transactions.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';

export interface PasswordResetRequestRow {
  readonly id: string;
  readonly schoolId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreatePasswordResetInput {
  readonly schoolId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly createdBy?: string | null;
}

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async create(
    input: CreatePasswordResetInput,
    tx?: PrismaTx,
  ): Promise<PasswordResetRequestRow> {
    const writer = this.resolve(tx);
    const id = randomUUID();
    const row = await writer.passwordResetRequest.create({
      data: {
        id,
        schoolId: input.schoolId,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      },
    });
    return map(row);
  }

  /**
   * Token-hash lookup is intentionally NOT tenant-scoped — the caller of
   * `POST /auth/password-reset/confirm` is anonymous and has no
   * RequestContext.schoolId. The token_hash column carries a unique index
   * across all tenants, so this stays O(1).
   */
  public async findByTokenHash(
    tokenHash: string,
    tx?: PrismaTx,
  ): Promise<PasswordResetRequestRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.passwordResetRequest.findUnique({
      where: { tokenHash },
    });
    return row === null ? null : map(row);
  }

  public async findActiveByUser(
    schoolId: string,
    userId: string,
    tx?: PrismaTx,
  ): Promise<PasswordResetRequestRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.passwordResetRequest.findFirst({
      where: {
        schoolId,
        userId,
        consumedAt: null,
        cancelledAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { requestedAt: 'desc' },
    });
    return row === null ? null : map(row);
  }

  public async markConsumed(
    schoolId: string,
    id: string,
    at: Date,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.passwordResetRequest.update({
      where: { schoolId_id: { schoolId, id } },
      data: { consumedAt: at, version: { increment: 1 } },
    });
  }

  public async cancelOutstandingForUser(
    schoolId: string,
    userId: string,
    at: Date,
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const result = await writer.passwordResetRequest.updateMany({
      where: {
        schoolId,
        userId,
        consumedAt: null,
        cancelledAt: null,
      },
      data: { cancelledAt: at },
    });
    return result.count;
  }
}

interface RawRow {
  id: string;
  schoolId: string;
  userId: string;
  tokenHash: string;
  requestedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  cancelledAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function map(row: RawRow): PasswordResetRequestRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    cancelledAt: row.cancelledAt,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
