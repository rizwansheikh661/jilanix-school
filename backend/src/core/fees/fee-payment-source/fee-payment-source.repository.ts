/**
 * FeePaymentSourceRepository — persistence for `fee_payment_sources` rows.
 *
 * Soft-deleted (`deletedAt`); active-uniqueness on `(schoolId, code)` is
 * enforced at the DB level by a hand-edited partial unique on the STORED
 * `deleted_at_key` column. The repo additionally pre-checks for duplicates
 * to surface a friendlier domain error before the DB constraint trips.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { FeePaymentSourceKindValue } from '../fees.constants';
import type { FeePaymentSourceRow } from '../fees.types';

export interface CreateFeePaymentSourceInput {
  readonly code: string;
  readonly name: string;
  readonly kind: FeePaymentSourceKindValue;
  readonly identifier: string;
  readonly ifsc?: string | null;
  readonly holderName?: string | null;
  readonly isActive?: boolean;
  readonly description?: string | null;
}

export interface UpdateFeePaymentSourceInput {
  readonly name?: string;
  readonly kind?: FeePaymentSourceKindValue;
  readonly identifier?: string;
  readonly ifsc?: string | null;
  readonly holderName?: string | null;
  readonly isActive?: boolean;
  readonly description?: string | null;
}

export interface ListFeePaymentSourceArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly kind?: FeePaymentSourceKindValue;
  readonly isActive?: boolean;
}

@Injectable()
export class FeePaymentSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeePaymentSourceRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<FeePaymentSourceRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.feePaymentSource.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByCodeInTx(
    tx: PrismaTx,
    code: string,
  ): Promise<FeePaymentSourceRow | null> {
    const { schoolId } = this.tenant();
    const row = await tx.feePaymentSource.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListFeePaymentSourceArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly FeePaymentSourceRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.kind !== undefined) where.kind = args.kind;
    if (args.isActive !== undefined) where.isActive = args.isActive;
    const rows = await reader.feePaymentSource.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    tx: PrismaTx,
    input: CreateFeePaymentSourceInput,
  ): Promise<FeePaymentSourceRow> {
    const { schoolId, userId } = this.tenant();
    const created = await tx.feePaymentSource.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        identifier: input.identifier,
        ifsc: input.ifsc ?? null,
        holderName: input.holderName ?? null,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        description: input.description ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async update(
    tx: PrismaTx,
    id: string,
    expectedVersion: number,
    input: UpdateFeePaymentSourceInput,
  ): Promise<FeePaymentSourceRow> {
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.identifier !== undefined) data.identifier = input.identifier;
    if (input.ifsc !== undefined) data.ifsc = input.ifsc;
    if (input.holderName !== undefined) data.holderName = input.holderName;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.description !== undefined) data.description = input.description;
    const result = await tx.feePaymentSource.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeePaymentSource', id, expectedVersion);
    }
    const reloaded = await tx.feePaymentSource.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('FeePaymentSource', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async softDelete(
    tx: PrismaTx,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    const { schoolId, userId } = this.tenant();
    const result = await tx.feePaymentSource.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('FeePaymentSource', id, expectedVersion);
    }
  }
}

interface RawFeePaymentSource {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  kind: string;
  identifier: string;
  ifsc: string | null;
  holderName: string | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawFeePaymentSource): FeePaymentSourceRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    kind: row.kind as FeePaymentSourceRow['kind'],
    identifier: row.identifier,
    ifsc: row.ifsc,
    holderName: row.holderName,
    isActive: row.isActive,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
