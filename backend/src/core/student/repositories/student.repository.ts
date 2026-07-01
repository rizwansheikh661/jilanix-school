/**
 * StudentRepository — read/write access to the `students` table. All
 * Prisma access goes through `this.prisma.client` (auto-wrapped with the
 * tenant-scope, soft-delete, audit, and slow-query extensions); writes
 * accept an optional `tx?: PrismaTx` so AdmissionService can call them
 * inside a wider transaction.
 *
 * Tenant scope is read from `RequestContextRegistry.require()` and never
 * accepted as a parameter — composite-PK selectors (`schoolId_id`) are
 * built from it. Roll-number uniqueness within `(section, academicYear)`
 * is enforced by the service via `findRollClash`; MySQL has no partial
 * unique index for the nullable `rollNo` column.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AdmissionTypeValue,
  EmergencyContact,
  GenderValue,
  ReligionValue,
  SocialCategoryValue,
  StudentRow,
  StudentStatusValue,
} from '../student.types';

export interface IndianSchoolFields {
  readonly religion?: ReligionValue | null;
  readonly category?: SocialCategoryValue | null;
  readonly nationality?: string;
  readonly motherTongue?: string | null;
  readonly aadhaarEncrypted?: string | null;
  readonly aadhaarLast4?: string | null;
  readonly apaarId?: string | null;
  readonly isCwsn?: boolean;
  readonly disabilityType?: string | null;
  readonly isRte?: boolean;
  readonly isMinority?: boolean;
  readonly minorityCommunity?: string | null;
  readonly isBpl?: boolean;
  readonly previousSchoolName?: string | null;
  readonly previousSchoolTcNo?: string | null;
  readonly previousSchoolTcDate?: Date | null;
  readonly admissionType?: AdmissionTypeValue | null;
  readonly placeOfBirth?: string | null;
  readonly birthCertNo?: string | null;
}

export interface CreateStudentInput extends IndianSchoolFields {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date;
  readonly gender: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly admissionNo: string;
  readonly rollNo?: string | null;
  readonly academicYearId: string;
  readonly classId: string;
  readonly sectionId: string;
  readonly admittedOn: Date;
  readonly status?: StudentStatusValue;
  readonly emergencyContacts: readonly EmergencyContact[];
}

export interface UpdateStudentInput extends IndianSchoolFields {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date;
  readonly gender?: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly emergencyContacts?: readonly EmergencyContact[];
}

export interface ListStudentsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: StudentStatusValue;
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly q?: string;
}

type Reader = PrismaTx;

@Injectable()
export class StudentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<StudentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.student.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findByAdmissionNo(
    admissionNo: string,
    tx?: PrismaTx,
  ): Promise<StudentRow | null> {
    const reader = this.reader(tx);
    const row = await reader.student.findFirst({ where: { admissionNo } });
    return row === null ? null : mapRow(row);
  }

  /**
   * Locate a non-deleted student that already holds `rollNo` inside the
   * same `(sectionId, academicYearId)` tuple. Returns `null` when free.
   * `excludeId` lets the update path ignore the row being mutated.
   */
  public async findRollClash(
    args: {
      readonly rollNo: string;
      readonly sectionId: string;
      readonly academicYearId: string;
      readonly excludeId?: string;
    },
    tx?: PrismaTx,
  ): Promise<StudentRow | null> {
    const reader = this.reader(tx);
    const row = await reader.student.findFirst({
      where: {
        rollNo: args.rollNo,
        sectionId: args.sectionId,
        academicYearId: args.academicYearId,
        ...(args.excludeId !== undefined ? { id: { not: args.excludeId } } : {}),
      },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListStudentsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly StudentRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = {};
    if (args.status !== undefined) where.status = args.status;
    if (args.academicYearId !== undefined) where.academicYearId = args.academicYearId;
    if (args.classId !== undefined) where.classId = args.classId;
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.q !== undefined && args.q !== '') {
      where.OR = [
        { firstName: { contains: args.q } },
        { lastName: { contains: args.q } },
        { admissionNo: { contains: args.q } },
      ];
    }
    const rows = await reader.student.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
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

  public async create(input: CreateStudentInput, tx?: PrismaTx): Promise<StudentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.student.create({
      data: {
        schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        bloodGroup: input.bloodGroup ?? null,
        photoUrl: input.photoUrl ?? null,
        admissionNo: input.admissionNo,
        rollNo: input.rollNo ?? null,
        academicYearId: input.academicYearId,
        classId: input.classId,
        sectionId: input.sectionId,
        admittedOn: input.admittedOn,
        status: input.status ?? 'ACTIVE',
        emergencyContacts: input.emergencyContacts as unknown as object,
        ...indianFieldsForWrite(input),
      },
      ...piiAuditCtx(input),
    } as Parameters<typeof writer.student.create>[0]);
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateStudentInput,
    tx?: PrismaTx,
  ): Promise<StudentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.firstName !== undefined) data.firstName = patch.firstName;
    if (patch.lastName !== undefined) data.lastName = patch.lastName;
    if (patch.dateOfBirth !== undefined) data.dateOfBirth = patch.dateOfBirth;
    if (patch.gender !== undefined) data.gender = patch.gender;
    if (patch.bloodGroup !== undefined) data.bloodGroup = patch.bloodGroup;
    if (patch.photoUrl !== undefined) data.photoUrl = patch.photoUrl;
    if (patch.academicYearId !== undefined) data.academicYearId = patch.academicYearId;
    if (patch.classId !== undefined) data.classId = patch.classId;
    if (patch.sectionId !== undefined) data.sectionId = patch.sectionId;
    if (patch.emergencyContacts !== undefined) {
      data.emergencyContacts = patch.emergencyContacts as unknown as object;
    }
    Object.assign(data, indianFieldsForWrite(patch));
    const result = await writer.student.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
      ...piiAuditCtx(patch),
    } as Parameters<typeof writer.student.updateMany>[0]);
    if (result.count === 0) {
      throw new VersionConflictError('Student', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async setStatus(
    id: string,
    expectedVersion: number,
    status: StudentStatusValue,
    tx?: PrismaTx,
  ): Promise<StudentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.student.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: { status, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Student', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async setRollNo(
    id: string,
    expectedVersion: number,
    rollNo: string | null,
    tx?: PrismaTx,
  ): Promise<StudentRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.student.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: { rollNo, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Student', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.student.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Student', id, expectedVersion);
    }
  }

  /** Confirm a non-deleted academic year exists in the tenant. */
  public async academicYearExists(yearId: string, tx?: PrismaTx): Promise<boolean> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.academicYear.findFirst({
      where: { schoolId, id: yearId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /** Confirm a non-deleted class exists in the tenant. */
  public async classExists(classId: string, tx?: PrismaTx): Promise<boolean> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.class.findFirst({
      where: { schoolId, id: classId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Confirm a non-deleted section exists AND belongs to the supplied class.
   * Used to validate the (classId, sectionId) tuple in one round-trip.
   */
  public async sectionBelongsToClass(
    sectionId: string,
    classId: string,
    tx?: PrismaTx,
  ): Promise<'ok' | 'not_found' | 'mismatch'> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.section.findFirst({
      where: { schoolId, id: sectionId, deletedAt: null },
      select: { classId: true },
    });
    if (row === null) return 'not_found';
    return row.classId === classId ? 'ok' : 'mismatch';
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<StudentRow> {
    const row = await reader.student.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Student', id, expectedVersion);
    }
    return mapRow(row);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('StudentRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawStudent {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  bloodGroup: string | null;
  photoUrl: string | null;
  admissionNo: string;
  rollNo: string | null;
  academicYearId: string;
  classId: string;
  sectionId: string;
  status: string;
  admittedOn: Date;
  emergencyContacts: unknown;
  religion: string | null;
  category: string | null;
  nationality: string;
  motherTongue: string | null;
  aadhaarLast4: string | null;
  apaarId: string | null;
  isCwsn: boolean;
  disabilityType: string | null;
  isRte: boolean;
  isMinority: boolean;
  minorityCommunity: string | null;
  isBpl: boolean;
  previousSchoolName: string | null;
  previousSchoolTcNo: string | null;
  previousSchoolTcDate: Date | null;
  admissionType: string | null;
  placeOfBirth: string | null;
  birthCertNo: string | null;
  houseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawStudent): StudentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as GenderValue,
    bloodGroup: row.bloodGroup,
    photoUrl: row.photoUrl,
    admissionNo: row.admissionNo,
    rollNo: row.rollNo,
    academicYearId: row.academicYearId,
    classId: row.classId,
    sectionId: row.sectionId,
    status: row.status as StudentStatusValue,
    admittedOn: row.admittedOn,
    emergencyContacts: Array.isArray(row.emergencyContacts)
      ? (row.emergencyContacts as readonly EmergencyContact[])
      : [],
    religion: row.religion === null ? null : (row.religion as ReligionValue),
    category: row.category === null ? null : (row.category as SocialCategoryValue),
    nationality: row.nationality,
    motherTongue: row.motherTongue,
    aadhaarLast4: row.aadhaarLast4,
    apaarId: row.apaarId,
    isCwsn: row.isCwsn,
    disabilityType: row.disabilityType,
    isRte: row.isRte,
    isMinority: row.isMinority,
    minorityCommunity: row.minorityCommunity,
    isBpl: row.isBpl,
    previousSchoolName: row.previousSchoolName,
    previousSchoolTcNo: row.previousSchoolTcNo,
    previousSchoolTcDate: row.previousSchoolTcDate,
    admissionType: row.admissionType === null ? null : (row.admissionType as AdmissionTypeValue),
    placeOfBirth: row.placeOfBirth,
    birthCertNo: row.birthCertNo,
    houseId: row.houseId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

function indianFieldsForWrite(input: IndianSchoolFields): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.religion !== undefined) data.religion = input.religion;
  if (input.category !== undefined) data.category = input.category;
  if (input.nationality !== undefined) data.nationality = input.nationality;
  if (input.motherTongue !== undefined) data.motherTongue = input.motherTongue;
  if (input.aadhaarEncrypted !== undefined) data.aadhaarEncrypted = input.aadhaarEncrypted;
  if (input.aadhaarLast4 !== undefined) data.aadhaarLast4 = input.aadhaarLast4;
  if (input.apaarId !== undefined) data.apaarId = input.apaarId;
  if (input.isCwsn !== undefined) data.isCwsn = input.isCwsn;
  if (input.disabilityType !== undefined) data.disabilityType = input.disabilityType;
  if (input.isRte !== undefined) data.isRte = input.isRte;
  if (input.isMinority !== undefined) data.isMinority = input.isMinority;
  if (input.minorityCommunity !== undefined) data.minorityCommunity = input.minorityCommunity;
  if (input.isBpl !== undefined) data.isBpl = input.isBpl;
  if (input.previousSchoolName !== undefined) data.previousSchoolName = input.previousSchoolName;
  if (input.previousSchoolTcNo !== undefined) data.previousSchoolTcNo = input.previousSchoolTcNo;
  if (input.previousSchoolTcDate !== undefined) {
    data.previousSchoolTcDate = input.previousSchoolTcDate;
  }
  if (input.admissionType !== undefined) data.admissionType = input.admissionType;
  if (input.placeOfBirth !== undefined) data.placeOfBirth = input.placeOfBirth;
  if (input.birthCertNo !== undefined) data.birthCertNo = input.birthCertNo;
  return data;
}

/**
 * Sprint 4: PII-touching writes (Aadhaar, category, religion, RTE, CWSN,
 * minority) carry audit category `'pii'` so DPDP-relevant access shows up
 * on a dedicated channel. The audit Prisma extension reads this off the
 * args envelope. Returns `{}` when the patch has no PII field.
 */
function piiAuditCtx(input: IndianSchoolFields): Record<string, unknown> {
  const touchesPii =
    input.aadhaarEncrypted !== undefined ||
    input.aadhaarLast4 !== undefined ||
    input.category !== undefined ||
    input.religion !== undefined ||
    input.isRte !== undefined ||
    input.isCwsn !== undefined ||
    input.isMinority !== undefined ||
    input.minorityCommunity !== undefined ||
    input.apaarId !== undefined;
  return touchesPii ? { __schoolosCtx: { auditCategory: 'pii' } } : {};
}
