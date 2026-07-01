/**
 * ParentRepository — read/write access to the `parents` table. Each row
 * represents one family (single household) and carries up to three
 * column-groups: father, mother, guardian. Linked to N students via
 * `ParentStudentLink`.
 *
 * The "at least one phone" invariant is enforced by the service before
 * the row is written; we do not encode it as a MySQL CHECK because
 * cross-version behaviour is brittle.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ParentRow } from '../parent.types';

export interface CreateParentInput {
  readonly fatherName?: string | null;
  readonly fatherPhone?: string | null;
  readonly fatherEmail?: string | null;
  readonly fatherOccupation?: string | null;
  readonly motherName?: string | null;
  readonly motherPhone?: string | null;
  readonly motherEmail?: string | null;
  readonly motherOccupation?: string | null;
  readonly guardianName?: string | null;
  readonly guardianPhone?: string | null;
  readonly guardianEmail?: string | null;
  readonly guardianOccupation?: string | null;
  readonly guardianRelation?: string | null;
  readonly addressLine1: string;
  readonly addressLine2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country?: string;
}

export interface UpdateParentInput {
  readonly fatherName?: string | null;
  readonly fatherPhone?: string | null;
  readonly fatherEmail?: string | null;
  readonly fatherOccupation?: string | null;
  readonly motherName?: string | null;
  readonly motherPhone?: string | null;
  readonly motherEmail?: string | null;
  readonly motherOccupation?: string | null;
  readonly guardianName?: string | null;
  readonly guardianPhone?: string | null;
  readonly guardianEmail?: string | null;
  readonly guardianOccupation?: string | null;
  readonly guardianRelation?: string | null;
  readonly addressLine1?: string;
  readonly addressLine2?: string | null;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly country?: string;
}

export interface ListParentsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly q?: string;
  readonly studentId?: string;
}

type Reader = PrismaTx;

@Injectable()
export class ParentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<ParentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.parent.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListParentsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly ParentRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = {};
    if (args.q !== undefined && args.q !== '') {
      where.OR = [
        { fatherName: { contains: args.q } },
        { motherName: { contains: args.q } },
        { guardianName: { contains: args.q } },
        { fatherPhone: { contains: args.q } },
        { motherPhone: { contains: args.q } },
        { guardianPhone: { contains: args.q } },
        { fatherEmail: { contains: args.q } },
        { motherEmail: { contains: args.q } },
        { guardianEmail: { contains: args.q } },
      ];
    }
    if (args.studentId !== undefined) {
      where.studentLinks = { some: { studentId: args.studentId } };
    }
    const rows = await reader.parent.findMany({
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

  public async create(input: CreateParentInput, tx?: PrismaTx): Promise<ParentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.parent.create({
      data: {
        schoolId,
        fatherName: input.fatherName ?? null,
        fatherPhone: input.fatherPhone ?? null,
        fatherEmail: input.fatherEmail ?? null,
        fatherOccupation: input.fatherOccupation ?? null,
        motherName: input.motherName ?? null,
        motherPhone: input.motherPhone ?? null,
        motherEmail: input.motherEmail ?? null,
        motherOccupation: input.motherOccupation ?? null,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
        guardianEmail: input.guardianEmail ?? null,
        guardianOccupation: input.guardianOccupation ?? null,
        guardianRelation: input.guardianRelation ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country ?? 'IN',
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateParentInput,
    tx?: PrismaTx,
  ): Promise<ParentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    const keys: ReadonlyArray<keyof UpdateParentInput> = [
      'fatherName',
      'fatherPhone',
      'fatherEmail',
      'fatherOccupation',
      'motherName',
      'motherPhone',
      'motherEmail',
      'motherOccupation',
      'guardianName',
      'guardianPhone',
      'guardianEmail',
      'guardianOccupation',
      'guardianRelation',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) {
        data[k] = patch[k];
      }
    }
    const result = await writer.parent.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Parent', id, expectedVersion);
    }
    const row = await writer.parent.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) {
      throw new VersionConflictError('Parent', id, expectedVersion);
    }
    return mapRow(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.parent.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Parent', id, expectedVersion);
    }
  }

  /** Confirm a non-deleted student exists in the tenant. */
  public async studentExists(studentId: string, tx?: PrismaTx): Promise<boolean> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.student.findFirst({
      where: { schoolId, id: studentId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ParentRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawParent {
  id: string;
  schoolId: string;
  fatherName: string | null;
  fatherPhone: string | null;
  fatherEmail: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherPhone: string | null;
  motherEmail: string | null;
  motherOccupation: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  guardianOccupation: string | null;
  guardianRelation: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawParent): ParentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    fatherName: row.fatherName,
    fatherPhone: row.fatherPhone,
    fatherEmail: row.fatherEmail,
    fatherOccupation: row.fatherOccupation,
    motherName: row.motherName,
    motherPhone: row.motherPhone,
    motherEmail: row.motherEmail,
    motherOccupation: row.motherOccupation,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    guardianEmail: row.guardianEmail,
    guardianOccupation: row.guardianOccupation,
    guardianRelation: row.guardianRelation,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
