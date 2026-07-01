/**
 * AdmissionRepository — read/write access to the `admissions` table.
 *
 * The admission row holds a snapshot of the candidate + parent fields
 * supplied at create time, plus workflow metadata. The state machine
 * itself lives in `AdmissionService`; this repository exposes targeted
 * setters (`markSubmitted`, `markApproved`, `markRejected`,
 * `markWithdrawn`) instead of a generic status update so the wire of
 * decision fields (decidedBy, decidedAt, linkage ids) is constrained.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  AdmissionTypeValue,
  GenderValue,
  ReligionValue,
  SocialCategoryValue,
} from '../../student/student.types';
import type { AdmissionRow, AdmissionStatusValue } from '../admission.types';

export interface AdmissionIndianFields {
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

export interface CreateAdmissionInput extends AdmissionIndianFields {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date;
  readonly gender: GenderValue;
  readonly bloodGroup?: string | null;
  readonly targetAcademicYearId: string;
  readonly targetClassId: string;
  readonly targetSectionId: string;
  readonly admissionNo?: string | null;
  readonly rollNo?: string | null;
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

export interface UpdateAdmissionInput extends AdmissionIndianFields {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date;
  readonly gender?: GenderValue;
  readonly bloodGroup?: string | null;
  readonly targetAcademicYearId?: string;
  readonly targetClassId?: string;
  readonly targetSectionId?: string;
  readonly admissionNo?: string | null;
  readonly rollNo?: string | null;
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

export interface ListAdmissionsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: AdmissionStatusValue;
  readonly targetAcademicYearId?: string;
  readonly targetClassId?: string;
  readonly q?: string;
}

type Reader = PrismaTx;

@Injectable()
export class AdmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<AdmissionRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.admission.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  /** Locate an admission already claiming `admissionNo` in this tenant. */
  public async findByAdmissionNo(
    admissionNo: string,
    excludeId?: string,
    tx?: PrismaTx,
  ): Promise<AdmissionRow | null> {
    const reader = this.reader(tx);
    const row = await reader.admission.findFirst({
      where: {
        admissionNo,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
    });
    return row === null ? null : mapRow(row);
  }

  public async findMany(
    args: ListAdmissionsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly AdmissionRow[]; readonly nextCursorId: string | null }> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const take = args.limit + 1;
    const where: Record<string, unknown> = {};
    if (args.status !== undefined) where.status = args.status;
    if (args.targetAcademicYearId !== undefined) {
      where.targetAcademicYearId = args.targetAcademicYearId;
    }
    if (args.targetClassId !== undefined) where.targetClassId = args.targetClassId;
    if (args.q !== undefined && args.q !== '') {
      where.OR = [
        { firstName: { contains: args.q } },
        { lastName: { contains: args.q } },
        { admissionNo: { contains: args.q } },
      ];
    }
    const rows = await reader.admission.findMany({
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

  public async create(input: CreateAdmissionInput, tx?: PrismaTx): Promise<AdmissionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.admission.create({
      data: {
        schoolId,
        status: 'DRAFT',
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        bloodGroup: input.bloodGroup ?? null,
        targetAcademicYearId: input.targetAcademicYearId,
        targetClassId: input.targetClassId,
        targetSectionId: input.targetSectionId,
        admissionNo: input.admissionNo ?? null,
        rollNo: input.rollNo ?? null,
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
        ...admissionIndianFieldsForWrite(input),
      },
      ...piiAuditCtx(input),
    } as Parameters<typeof writer.admission.create>[0]);
    return mapRow(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAdmissionInput,
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const data: Record<string, unknown> = { version: { increment: 1 } };
    const keys: ReadonlyArray<keyof UpdateAdmissionInput> = [
      'firstName',
      'lastName',
      'dateOfBirth',
      'gender',
      'bloodGroup',
      'targetAcademicYearId',
      'targetClassId',
      'targetSectionId',
      'admissionNo',
      'rollNo',
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
    Object.assign(data, admissionIndianFieldsForWrite(patch));
    const result = await writer.admission.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data,
      ...piiAuditCtx(patch),
    } as Parameters<typeof writer.admission.updateMany>[0]);
    if (result.count === 0) {
      throw new VersionConflictError('Admission', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  public async markSubmitted(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    return this.applyTransition(id, expectedVersion, { status: 'SUBMITTED' }, tx);
  }

  public async markApproved(
    id: string,
    expectedVersion: number,
    args: {
      readonly studentId: string;
      readonly parentId: string;
      readonly decidedBy: string | null;
      readonly decisionNote?: string | null;
    },
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    return this.applyTransition(
      id,
      expectedVersion,
      {
        status: 'APPROVED',
        studentId: args.studentId,
        parentId: args.parentId,
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.decisionNote ?? null,
      },
      tx,
    );
  }

  public async markRejected(
    id: string,
    expectedVersion: number,
    args: { readonly decidedBy: string | null; readonly decisionNote?: string | null },
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    return this.applyTransition(
      id,
      expectedVersion,
      {
        status: 'REJECTED',
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.decisionNote ?? null,
      },
      tx,
    );
  }

  public async markWithdrawn(
    id: string,
    expectedVersion: number,
    args: { readonly decidedBy: string | null; readonly decisionNote?: string | null },
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    return this.applyTransition(
      id,
      expectedVersion,
      {
        status: 'WITHDRAWN',
        decidedBy: args.decidedBy,
        decidedAt: new Date(),
        decisionNote: args.decisionNote ?? null,
      },
      tx,
    );
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.admission.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Admission', id, expectedVersion);
    }
  }

  private async applyTransition(
    id: string,
    expectedVersion: number,
    data: Record<string, unknown>,
    tx?: PrismaTx,
  ): Promise<AdmissionRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const result = await writer.admission.updateMany({
      where: { schoolId, id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Admission', id, expectedVersion);
    }
    return this.requireById(writer, schoolId, id, expectedVersion);
  }

  private async requireById(
    reader: Reader,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ): Promise<AdmissionRow> {
    const row = await reader.admission.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (row === null) {
      throw new VersionConflictError('Admission', id, expectedVersion);
    }
    return mapRow(row);
  }

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('AdmissionRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

interface RawAdmission {
  id: string;
  schoolId: string;
  status: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  bloodGroup: string | null;
  targetAcademicYearId: string;
  targetClassId: string;
  targetSectionId: string;
  admissionNo: string | null;
  rollNo: string | null;
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
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  studentId: string | null;
  parentId: string | null;
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
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawAdmission): AdmissionRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    status: row.status as AdmissionStatusValue,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as GenderValue,
    bloodGroup: row.bloodGroup,
    targetAcademicYearId: row.targetAcademicYearId,
    targetClassId: row.targetClassId,
    targetSectionId: row.targetSectionId,
    admissionNo: row.admissionNo,
    rollNo: row.rollNo,
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
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    studentId: row.studentId,
    parentId: row.parentId,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

function admissionIndianFieldsForWrite(input: AdmissionIndianFields): Record<string, unknown> {
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
 * Sprint 4: PII-touching writes carry audit category `'pii'` so DPDP-
 * relevant access is logged on a dedicated channel.
 */
function piiAuditCtx(input: AdmissionIndianFields): Record<string, unknown> {
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
