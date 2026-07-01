import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { HouseAssignmentRow, HouseRow } from '../house.types';

export interface CreateHouseInput {
  readonly code: string;
  readonly name: string;
  readonly colorHex: string;
  readonly motto?: string | null;
  readonly captainStudentId?: string | null;
  readonly viceCaptainStudentId?: string | null;
  readonly photoUrl?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateHouseInput {
  readonly code?: string;
  readonly name?: string;
  readonly colorHex?: string;
  readonly motto?: string | null;
  readonly captainStudentId?: string | null;
  readonly viceCaptainStudentId?: string | null;
  readonly photoUrl?: string | null;
  readonly sortOrder?: number;
}

@Injectable()
export class HouseRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('HouseRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<HouseRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.house.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null || row.deletedAt !== null ? null : map(row);
  }

  public async listAll(tx?: PrismaTx): Promise<readonly HouseRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.house.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(map);
  }

  public async create(input: CreateHouseInput, tx?: PrismaTx): Promise<HouseRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.house.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        colorHex: input.colorHex,
        motto: input.motto ?? null,
        captainStudentId: input.captainStudentId ?? null,
        viceCaptainStudentId: input.viceCaptainStudentId ?? null,
        photoUrl: input.photoUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return map(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateHouseInput,
    tx?: PrismaTx,
  ): Promise<HouseRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: userId ?? null };
    const fields: ReadonlyArray<keyof UpdateHouseInput> = [
      'code', 'name', 'colorHex', 'motto', 'captainStudentId',
      'viceCaptainStudentId', 'photoUrl', 'sortOrder',
    ];
    for (const k of fields) if (input[k] !== undefined) data[k] = input[k];
    const result = await writer.house.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) throw new VersionConflictError('House', id, expectedVersion);
    const row = await writer.house.findUnique({ where: { schoolId_id: { schoolId, id } } });
    if (row === null) throw new VersionConflictError('House', id, expectedVersion);
    return map(row);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.house.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new VersionConflictError('House', id, expectedVersion);
  }
}

interface RawHouse {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  colorHex: string;
  motto: string | null;
  captainStudentId: string | null;
  viceCaptainStudentId: string | null;
  photoUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function map(row: RawHouse): HouseRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    colorHex: row.colorHex,
    motto: row.motto,
    captainStudentId: row.captainStudentId,
    viceCaptainStudentId: row.viceCaptainStudentId,
    photoUrl: row.photoUrl,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

// ---------- HouseAssignmentRepository ----------

export interface CreateHouseAssignmentInput {
  readonly studentId: string;
  readonly houseId: string;
  readonly academicYearId: string;
  readonly assignedOn: Date;
  readonly reason?: string | null;
}

@Injectable()
export class HouseAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) throw new Error('HouseAssignmentRepository requires tenant scope.');
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<HouseAssignmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.houseAssignment.findUnique({ where: { schoolId_id: { schoolId, id } } });
    return row === null ? null : mapAssign(row);
  }

  public async findActiveForStudentYear(
    args: { studentId: string; academicYearId: string },
    tx?: PrismaTx,
  ): Promise<HouseAssignmentRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.houseAssignment.findFirst({
      where: {
        schoolId,
        studentId: args.studentId,
        academicYearId: args.academicYearId,
        endedOn: null,
      },
    });
    return row === null ? null : mapAssign(row);
  }

  public async listForHouse(
    args: { houseId: string; academicYearId?: string },
    tx?: PrismaTx,
  ): Promise<readonly HouseAssignmentRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, houseId: args.houseId };
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    const rows = await reader.houseAssignment.findMany({
      where,
      orderBy: [{ assignedOn: 'desc' }],
    });
    return rows.map(mapAssign);
  }

  public async listForStudent(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<readonly HouseAssignmentRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const rows = await reader.houseAssignment.findMany({
      where: { schoolId, studentId },
      orderBy: [{ assignedOn: 'desc' }],
    });
    return rows.map(mapAssign);
  }

  public async closeAssignment(
    args: { id: string; endedOn: Date },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    await writer.houseAssignment.updateMany({
      where: { schoolId, id: args.id, endedOn: null },
      data: {
        endedOn: args.endedOn,
        updatedBy: userId ?? null,
        version: { increment: 1 },
      },
    });
  }

  public async create(input: CreateHouseAssignmentInput, tx?: PrismaTx): Promise<HouseAssignmentRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.houseAssignment.create({
      data: {
        schoolId,
        studentId: input.studentId,
        houseId: input.houseId,
        academicYearId: input.academicYearId,
        assignedOn: input.assignedOn,
        reason: input.reason ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapAssign(row);
  }

  public async updateStudentDenormHouse(
    args: { studentId: string; houseId: string | null },
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    await writer.student.updateMany({
      where: { schoolId, id: args.studentId },
      data: { houseId: args.houseId },
    });
  }
}

interface RawAssign {
  id: string;
  schoolId: string;
  studentId: string;
  houseId: string;
  academicYearId: string;
  assignedOn: Date;
  endedOn: Date | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapAssign(row: RawAssign): HouseAssignmentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    houseId: row.houseId,
    academicYearId: row.academicYearId,
    assignedOn: row.assignedOn,
    endedOn: row.endedOn,
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
