/**
 * StudentService — orchestrates the Student lifecycle. Three concerns:
 *
 *   1. Placement validation — `(academicYearId, classId, sectionId)` must
 *      resolve to live rows in this tenant, and `sectionId` must belong
 *      to `classId`. Bad inputs throw `PlacementInvalidError` (422)
 *      before we ever hit the FK constraints.
 *   2. Identity uniqueness — admission number is unique per tenant
 *      (`uq_students_school_admission_no`); roll number must be unique
 *      inside `(sectionId, academicYearId)` when set, but MySQL has no
 *      partial unique index, so we pre-flight `findRollClash`.
 *   3. Status machine — `deactivate` flips ACTIVE → INACTIVE,
 *      `reactivate` does the reverse. Other terminal statuses
 *      (`GRADUATED`, `TC_ISSUED`, `EXPELLED`) are valid values but no
 *      dedicated endpoints ship in Sprint 3.
 *
 * Every write runs in `prisma.transaction` so the pre-flight checks see
 * the same snapshot the write commits against. AdmissionService calls
 * `create(args, tx)` from inside its own transaction during APPROVE.
 */
import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '../../../infra/crypto';
import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { SubscriptionGuardService } from '../../subscription';
import {
  AdmissionNumberTakenError,
  PlacementInvalidError,
  RollNumberTakenError,
  StudentInactiveError,
} from '../student.errors';
import type {
  AdmissionTypeValue,
  EmergencyContact,
  GenderValue,
  ReligionValue,
  SocialCategoryValue,
  StudentRow,
  StudentStatusValue,
} from '../student.types';
import {
  StudentRepository,
  type CreateStudentInput,
  type IndianSchoolFields,
  type UpdateStudentInput,
} from '../repositories/student.repository';

export interface IndianSchoolArgs {
  readonly religion?: ReligionValue | null;
  readonly category?: SocialCategoryValue | null;
  readonly nationality?: string;
  readonly motherTongue?: string | null;
  /** Plain Aadhaar — sealed via CryptoService before storage. */
  readonly aadhaar?: string | null;
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

export interface CreateStudentArgs extends IndianSchoolArgs {
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

export interface UpdateStudentArgs extends IndianSchoolArgs {
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

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StudentRepository,
    private readonly crypto: CryptoService,
    private readonly guard: SubscriptionGuardService,
  ) {}

  public async list(
    args: ListStudentsArgs,
  ): Promise<{ readonly items: readonly StudentRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<StudentRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Student', id);
    }
    return row;
  }

  /**
   * Create a new student. Accepts an optional `tx` so AdmissionService
   * can run create + parent + link inside one transaction.
   */
  public async create(args: CreateStudentArgs, tx?: PrismaTx): Promise<StudentRow> {
    const run = async (t: PrismaTx): Promise<StudentRow> => {
      await this.assertPlacement(args, t);
      const dup = await this.repo.findByAdmissionNo(args.admissionNo, t);
      if (dup !== null) {
        throw new AdmissionNumberTakenError(args.admissionNo);
      }
      if (args.rollNo !== undefined && args.rollNo !== null && args.rollNo !== '') {
        const clash = await this.repo.findRollClash(
          {
            rollNo: args.rollNo,
            sectionId: args.sectionId,
            academicYearId: args.academicYearId,
          },
          t,
        );
        if (clash !== null) {
          throw new RollNumberTakenError({
            rollNo: args.rollNo,
            sectionId: args.sectionId,
            academicYearId: args.academicYearId,
          });
        }
      }
      const created = await this.repo.create(this.toCreateInput(args), t);
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.assertAndConsume(
          schoolId,
          'student_count',
          1,
          `student:${created.id}`,
          t,
        );
      }
      return created;
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateStudentArgs,
  ): Promise<StudentRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Student', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Student', id, expectedVersion);
      }
      if (
        patch.academicYearId !== undefined ||
        patch.classId !== undefined ||
        patch.sectionId !== undefined
      ) {
        await this.assertPlacement(
          {
            academicYearId: patch.academicYearId ?? current.academicYearId,
            classId: patch.classId ?? current.classId,
            sectionId: patch.sectionId ?? current.sectionId,
          },
          tx,
        );
      }
      return this.repo.update(id, expectedVersion, this.toUpdateInput(patch), tx);
    });
  }

  public async deactivate(id: string, expectedVersion: number): Promise<StudentRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Student', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Student', id, expectedVersion);
      }
      if (current.status !== 'ACTIVE') {
        throw new StudentInactiveError({
          studentId: id,
          currentStatus: current.status,
          attempted: 'deactivate',
        });
      }
      const updated = await this.repo.setStatus(id, expectedVersion, 'INACTIVE', tx);
      this.logger.log(`Deactivated Student ${id}.`);
      return updated;
    });
  }

  public async reactivate(id: string, expectedVersion: number): Promise<StudentRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Student', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Student', id, expectedVersion);
      }
      if (current.status !== 'INACTIVE') {
        throw new StudentInactiveError({
          studentId: id,
          currentStatus: current.status,
          attempted: 'reactivate',
        });
      }
      const updated = await this.repo.setStatus(id, expectedVersion, 'ACTIVE', tx);
      this.logger.log(`Reactivated Student ${id}.`);
      return updated;
    });
  }

  public async assignRoll(
    id: string,
    expectedVersion: number,
    rollNo: string | null,
  ): Promise<StudentRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Student', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Student', id, expectedVersion);
      }
      if (rollNo !== null && rollNo !== '') {
        const clash = await this.repo.findRollClash(
          {
            rollNo,
            sectionId: current.sectionId,
            academicYearId: current.academicYearId,
            excludeId: id,
          },
          tx,
        );
        if (clash !== null) {
          throw new RollNumberTakenError({
            rollNo,
            sectionId: current.sectionId,
            academicYearId: current.academicYearId,
          });
        }
      }
      return this.repo.setRollNo(id, expectedVersion, rollNo, tx);
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Student', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Student', id, expectedVersion);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.releaseUsage(schoolId, 'student_count', 1, `student:${id}`, tx);
      }
      this.logger.log(`Soft-deleted Student ${id}.`);
    });
  }

  private async assertPlacement(
    args: {
      readonly academicYearId: string;
      readonly classId: string;
      readonly sectionId: string;
    },
    tx: PrismaTx,
  ): Promise<void> {
    const yearOk = await this.repo.academicYearExists(args.academicYearId, tx);
    if (!yearOk) {
      throw new PlacementInvalidError({
        field: 'academicYearId',
        reason: 'not_found',
        value: args.academicYearId,
      });
    }
    const classOk = await this.repo.classExists(args.classId, tx);
    if (!classOk) {
      throw new PlacementInvalidError({
        field: 'classId',
        reason: 'not_found',
        value: args.classId,
      });
    }
    const sectionStatus = await this.repo.sectionBelongsToClass(args.sectionId, args.classId, tx);
    if (sectionStatus === 'not_found') {
      throw new PlacementInvalidError({
        field: 'sectionId',
        reason: 'not_found',
        value: args.sectionId,
      });
    }
    if (sectionStatus === 'mismatch') {
      throw new PlacementInvalidError({
        field: 'sectionId',
        reason: 'mismatch',
        value: args.sectionId,
      });
    }
  }

  private toCreateInput(args: CreateStudentArgs): CreateStudentInput {
    return {
      firstName: args.firstName,
      lastName: args.lastName,
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      bloodGroup: args.bloodGroup ?? null,
      photoUrl: args.photoUrl ?? null,
      admissionNo: args.admissionNo,
      rollNo: args.rollNo ?? null,
      academicYearId: args.academicYearId,
      classId: args.classId,
      sectionId: args.sectionId,
      admittedOn: args.admittedOn,
      ...(args.status !== undefined ? { status: args.status } : {}),
      emergencyContacts: args.emergencyContacts,
      ...this.indianFieldsForWrite(args),
    };
  }

  private toUpdateInput(patch: UpdateStudentArgs): UpdateStudentInput {
    return {
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.dateOfBirth !== undefined ? { dateOfBirth: patch.dateOfBirth } : {}),
      ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
      ...(patch.bloodGroup !== undefined ? { bloodGroup: patch.bloodGroup } : {}),
      ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl } : {}),
      ...(patch.academicYearId !== undefined ? { academicYearId: patch.academicYearId } : {}),
      ...(patch.classId !== undefined ? { classId: patch.classId } : {}),
      ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
      ...(patch.emergencyContacts !== undefined
        ? { emergencyContacts: patch.emergencyContacts }
        : {}),
      ...this.indianFieldsForWrite(patch),
    };
  }

  private indianFieldsForWrite(args: IndianSchoolArgs): Partial<IndianSchoolFields> {
    const out: Record<string, unknown> = {};
    if (args.religion !== undefined) out.religion = args.religion;
    if (args.category !== undefined) out.category = args.category;
    if (args.nationality !== undefined) out.nationality = args.nationality;
    if (args.motherTongue !== undefined) out.motherTongue = args.motherTongue;
    if (args.aadhaar !== undefined) {
      if (args.aadhaar === null || args.aadhaar === '') {
        out.aadhaarEncrypted = null;
        out.aadhaarLast4 = null;
      } else {
        out.aadhaarEncrypted = this.crypto.sealString(args.aadhaar);
        const l4 = this.crypto.last4(args.aadhaar);
        out.aadhaarLast4 = l4 === '' ? null : l4;
      }
    }
    if (args.apaarId !== undefined) out.apaarId = args.apaarId;
    if (args.isCwsn !== undefined) out.isCwsn = args.isCwsn;
    if (args.disabilityType !== undefined) out.disabilityType = args.disabilityType;
    if (args.isRte !== undefined) out.isRte = args.isRte;
    if (args.isMinority !== undefined) out.isMinority = args.isMinority;
    if (args.minorityCommunity !== undefined) out.minorityCommunity = args.minorityCommunity;
    if (args.isBpl !== undefined) out.isBpl = args.isBpl;
    if (args.previousSchoolName !== undefined) out.previousSchoolName = args.previousSchoolName;
    if (args.previousSchoolTcNo !== undefined) out.previousSchoolTcNo = args.previousSchoolTcNo;
    if (args.previousSchoolTcDate !== undefined) {
      out.previousSchoolTcDate = args.previousSchoolTcDate;
    }
    if (args.admissionType !== undefined) out.admissionType = args.admissionType;
    if (args.placeOfBirth !== undefined) out.placeOfBirth = args.placeOfBirth;
    if (args.birthCertNo !== undefined) out.birthCertNo = args.birthCertNo;
    return out as Partial<IndianSchoolFields>;
  }
}
