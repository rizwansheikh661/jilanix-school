import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_TTL_HOURS,
  type IdempotencyStatus,
} from './idempotency.constants';
import { IdempotencyConflictError, IdempotencyInProgressError } from './idempotency.errors';
import type { IdempotencyKeyRow } from './idempotency.types';
import { IdempotencyKeyRepository } from './repositories/idempotency-key.repository';

export interface IdempotencyLookupHit {
  readonly kind: 'hit';
  readonly responseStatus: number;
  readonly responseBody: unknown;
}

export interface IdempotencyLookupReserved {
  readonly kind: 'reserved';
  readonly id: string;
}

export type IdempotencyLookupResult = IdempotencyLookupHit | IdempotencyLookupReserved;

/**
 * Service backing the idempotency middleware. The middleware never touches
 * the repository directly — keeping the SHA logic and TTL arithmetic in one
 * place makes the moving parts independently testable.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly repo: IdempotencyKeyRepository) {}

  public computeFingerprint(args: {
    method: string;
    path: string;
    body: unknown;
  }): string {
    const canonical = JSON.stringify({
      method: args.method.toUpperCase(),
      path: args.path,
      body: args.body ?? null,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  public async lookupOrReserve(args: {
    schoolId: string | null;
    key: string;
    fingerprint: string;
  }): Promise<IdempotencyLookupResult> {
    const existing = await this.repo.findActive(args.schoolId, args.key);
    if (existing !== null) {
      this.assertCompatibleFingerprint(existing, args.fingerprint);
      if (existing.status === IDEMPOTENCY_STATUS.IN_PROGRESS) {
        throw new IdempotencyInProgressError(args.key);
      }
      return {
        kind: 'hit',
        responseStatus: existing.responseStatus ?? 200,
        responseBody: existing.responseBody,
      };
    }
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
    const reserved = await this.repo.reserve({
      id: ulid(),
      schoolId: args.schoolId,
      key: args.key,
      requestFingerprint: args.fingerprint,
      expiresAt,
    });
    return { kind: 'reserved', id: reserved.id };
  }

  public async complete(args: {
    id: string;
    responseStatus: number;
    responseBody: unknown;
    success: boolean;
  }): Promise<void> {
    const status: IdempotencyStatus = args.success
      ? IDEMPOTENCY_STATUS.COMPLETED
      : IDEMPOTENCY_STATUS.FAILED;
    try {
      await this.repo.complete(args.id, {
        responseStatus: args.responseStatus,
        responseBody: this.toJsonSafe(args.responseBody),
        status,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist idempotency completion id=${args.id}: ${(err as Error).message}`,
      );
    }
  }

  public async releaseReservation(id: string): Promise<void> {
    try {
      await this.repo.deleteById(id);
    } catch (err) {
      this.logger.warn(
        `Failed to release idempotency reservation id=${id}: ${(err as Error).message}`,
      );
    }
  }

  private assertCompatibleFingerprint(row: IdempotencyKeyRow, fingerprint: string): void {
    if (row.requestFingerprint !== fingerprint) {
      throw new IdempotencyConflictError(row.key);
    }
  }

  private toJsonSafe(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) {
      return null as unknown as Prisma.InputJsonValue;
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return String(value);
    }
  }
}
