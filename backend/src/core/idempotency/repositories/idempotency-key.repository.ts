import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { IdempotencyStatus } from '../idempotency.constants';
import type { IdempotencyKeyRow } from '../idempotency.types';

export interface ReserveIdempotencyKeyInput {
  readonly id: string;
  readonly schoolId: string | null;
  readonly key: string;
  readonly requestFingerprint: string;
  readonly expiresAt: Date;
}

export interface CompleteIdempotencyKeyInput {
  readonly responseStatus: number;
  readonly responseBody: Prisma.InputJsonValue;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly status: IdempotencyStatus;
}

@Injectable()
export class IdempotencyKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findActive(
    schoolId: string | null,
    key: string,
  ): Promise<IdempotencyKeyRow | null> {
    const row = await this.client().idempotencyKey.findFirst({
      where: { schoolId, key, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return row === null ? null : mapRow(row);
  }

  public async reserve(input: ReserveIdempotencyKeyInput, tx?: PrismaTx): Promise<IdempotencyKeyRow> {
    const c = this.client(tx);
    const row = await c.idempotencyKey.create({
      data: {
        id: input.id,
        schoolId: input.schoolId,
        key: input.key,
        requestFingerprint: input.requestFingerprint,
        status: 'in_progress',
        expiresAt: input.expiresAt,
      },
    });
    return mapRow(row);
  }

  public async complete(id: string, input: CompleteIdempotencyKeyInput): Promise<void> {
    await this.client().idempotencyKey.update({
      where: { id },
      data: {
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
        ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
        ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
        status: input.status,
        completedAt: new Date(),
      },
    });
  }

  public async deleteById(id: string): Promise<void> {
    await this.client().idempotencyKey.deleteMany({ where: { id } });
  }

  public async deleteExpired(now: Date): Promise<number> {
    const result = await this.client().idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}

interface Raw {
  id: string;
  schoolId: string | null;
  key: string;
  requestFingerprint: string;
  resourceType: string | null;
  resourceId: string | null;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

function mapRow(r: Raw): IdempotencyKeyRow {
  return {
    id: r.id,
    schoolId: r.schoolId,
    key: r.key,
    requestFingerprint: r.requestFingerprint,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    responseStatus: r.responseStatus,
    responseBody: r.responseBody,
    status: r.status as IdempotencyStatus,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}
