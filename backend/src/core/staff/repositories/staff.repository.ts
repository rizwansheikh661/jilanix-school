/**
 * StaffRepository — read/write access to the `staff` master table.
 * Returns full `StaffRow` (including encrypted PII columns) so the
 * service can decrypt selectively on the PII endpoint. Standard
 * response DTOs strip the encrypted columns.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { GenderValue } from '../../student';
import type { StaffRow, StaffStatusValue } from '../staff.types';

export interface CreateStaffInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date | null;
  readonly gender: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly email?: string | null;
  readonly phone: string;
  readonly alternatePhone?: string | null;
  readonly panEncrypted?: string | null;
  readonly panLast4?: string | null;
  readonly aadhaarEncrypted?: string | null;
  readonly aadhaarLast4?: string | null;
  readonly addressLine1: string;
  readonly addressLine2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country?: string;
  readonly employeeCode: string;
  readonly designation: string;
  readonly department?: string | null;
  readonly dateOfJoining: Date;
  readonly dateOfLeaving?: Date | null;
  readonly status?: StaffStatusValue;
  readonly bankAccountEncrypted?: string | null;
  readonly bankAccountLast4?: string | null;
  readonly bankIfsc?: string | null;
  readonly userId?: string | null;
}

export interface UpdateStaffInput {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date | null;
  readonly gender?: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly email?: string | null;
  readonly phone?: string;
  readonly alternatePhone?: string | null;
  readonly panEncrypted?: string | null;
  readonly panLast4?: string | null;
  readonly aadhaarEncrypted?: string | null;
  readonly aadhaarLast4?: string | null;
  readonly addressLine1?: string;
  readonly addressLine2?: string | null;
  readonly city?: string;
  readonly state?: string;
  readonly postalCode?: string;
  readonly country?: string;
  readonly designation?: string;
  readonly department?: string | null;
  readonly dateOfJoining?: Date;
  readonly dateOfLeaving?: Date | null;
  readonly bankAccountEncrypted?: string | null;
  readonly bankAccountLast4?: string | null;
  readonly bankIfsc?: string | null;
  readonly userId?: string | null;
}

export interface ListStaffArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: StaffStatusValue;
  readonly designation?: string;
  readonly department?: string;
  readonly q?: string;
}

type Reader = PrismaTx;

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<StaffRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staff.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByEmployeeCode(
    employeeCode: string,
    tx?: PrismaTx,
  ): Promise<StaffRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.staff.findFirst({
      where: { schoolId, employeeCode },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListStaffArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly StaffRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.status !== undefined) where.status = args.status;
    if (args.designation !== undefined) where.designation = args.designation;
    if (args.department !== undefined) where.department = args.department;
    if (args.q !== undefined && args.q !== '') {
      where.OR = [
        { firstName: { contains: args.q } },
        { lastName: { contains: args.q } },
        { employeeCode: { contains: args.q } },
        { phone: { contains: args.q } },
      ];
    }
    const rows = await reader.staff.findMany({
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

  public async create(input: CreateStaffInput, tx?: PrismaTx): Promise<StaffRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.staff.create({
      data: {
        schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender,
        bloodGroup: input.bloodGroup ?? null,
        photoUrl: input.photoUrl ?? null,
        email: input.email ?? null,
        phone: input.phone,
        alternatePhone: input.alternatePhone ?? null,
        panEncrypted: input.panEncrypted ?? null,
        panLast4: input.panLast4 ?? null,
        aadhaarEncrypted: input.aadhaarEncrypted ?? null,
        aadhaarLast4: input.aadhaarLast4 ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country ?? 'IN',
        employeeCode: input.employeeCode,
        designation: input.designation,
        department: input.department ?? null,
        dateOfJoining: input.dateOfJoining,
        dateOfLeaving: input.dateOfLeaving ?? null,
        status: input.status ?? 'ACTIVE',
        bankAccountEncrypted: input.bankAccountEncrypted ?? null,
        bankAccountLast4: input.bankAccountLast4 ?? null,
        bankIfsc: input.bankIfsc ?? null,
        userId: input.userId ?? null,
      },
    });
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateStaffInput,
    tx?: PrismaTx,
  ): Promise<StaffRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    const keys: ReadonlyArray<keyof UpdateStaffInput> = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'gender',
      'bloodGroup',
      'photoUrl',
      'email',
      'phone',
      'alternatePhone',
      'panEncrypted',
      'panLast4',
      'aadhaarEncrypted',
      'aadhaarLast4',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
      'country',
      'designation',
      'department',
      'dateOfJoining',
      'dateOfLeaving',
      'bankAccountEncrypted',
      'bankAccountLast4',
      'bankIfsc',
      'userId',
    ];
    for (const k of keys) {
      if (patch[k] !== undefined) {
        data[k] = patch[k];
      }
    }
    const result = await writer.staff.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Staff', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: StaffStatusValue,
    extra: { readonly dateOfLeaving?: Date | null } = {},
    tx?: PrismaTx,
  ): Promise<StaffRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { status, version: { increment: 1 } };
    if (extra.dateOfLeaving !== undefined) data.dateOfLeaving = extra.dateOfLeaving;
    const result = await writer.staff.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Staff', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.staff.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Staff', id, expectedVersion);
    }
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<StaffRow> {
    const row = await reader.staff.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Staff', id, expectedVersion);
    }
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StaffRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawStaff {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: string;
  bloodGroup: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string;
  alternatePhone: string | null;
  panEncrypted: string | null;
  panLast4: string | null;
  aadhaarEncrypted: string | null;
  aadhaarLast4: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  employeeCode: string;
  designation: string;
  department: string | null;
  departmentId: string | null;
  designationId: string | null;
  dateOfJoining: Date;
  dateOfLeaving: Date | null;
  status: string;
  bankAccountEncrypted: string | null;
  bankAccountLast4: string | null;
  bankIfsc: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawStaff): StaffRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as GenderValue,
    bloodGroup: row.bloodGroup,
    photoUrl: row.photoUrl,
    email: row.email,
    phone: row.phone,
    alternatePhone: row.alternatePhone,
    panEncrypted: row.panEncrypted,
    panLast4: row.panLast4,
    aadhaarEncrypted: row.aadhaarEncrypted,
    aadhaarLast4: row.aadhaarLast4,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    employeeCode: row.employeeCode,
    designation: row.designation,
    department: row.department,
    departmentId: row.departmentId,
    designationId: row.designationId,
    dateOfJoining: row.dateOfJoining,
    dateOfLeaving: row.dateOfLeaving,
    status: row.status as StaffStatusValue,
    bankAccountEncrypted: row.bankAccountEncrypted,
    bankAccountLast4: row.bankAccountLast4,
    bankIfsc: row.bankIfsc,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
