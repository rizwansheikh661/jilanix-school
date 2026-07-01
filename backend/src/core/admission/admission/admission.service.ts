/**
 * AdmissionService — orchestrates the Admission workflow and owns the
 * state machine:
 *
 *   DRAFT      ── submit ──>  SUBMITTED
 *   DRAFT      ── withdraw ─>  WITHDRAWN
 *   SUBMITTED  ── approve ──>  APPROVED   [terminal]
 *   SUBMITTED  ── reject ───>  REJECTED   [terminal]
 *   SUBMITTED  ── withdraw ─>  WITHDRAWN
 *
 * APPROVED / REJECTED / WITHDRAWN are terminal. Every transition writes
 * an `AdmissionHistory` row inside the same transaction; the APPROVE
 * transition additionally composes `StudentService.create` +
 * `ParentService.create` + `ParentService.linkStudent` so the four
 * writes commit atomically.
 *
 * Update + delete are guarded by the state machine — only DRAFT rows
 * are mutable; only DRAFT/REJECTED/WITHDRAWN may be soft-deleted.
 */
import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '../../../infra/crypto';
import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { ParentService } from '../../parent';
import type { ParentRow, ParentStudentLinkRow } from '../../parent';
import { RequestContextRegistry } from '../../request-context';
import { StudentService } from '../../student';
import type { EmergencyContact, GenderValue, StudentRow } from '../../student';
import {
  ADMISSION_TERMINAL_STATES,
  type AdmissionHistoryRow,
  type AdmissionRow,
  type AdmissionStatusValue,
} from '../admission.types';
import {
  AdmissionAlreadyDecidedError,
  AdmissionNotApprovableError,
  AdmissionNotDeletableError,
  InvalidAdmissionTransitionError,
} from '../admission.errors';
import {
  AdmissionRepository,
  type AdmissionIndianFields,
  type CreateAdmissionInput,
  type UpdateAdmissionInput,
} from '../repositories/admission.repository';
import { AdmissionHistoryRepository } from '../repositories/admission-history.repository';

interface AadhaarPlaintext {
  readonly aadhaar?: string | null;
}

export interface CreateAdmissionArgs
  extends Omit<CreateAdmissionInput, 'aadhaarEncrypted' | 'aadhaarLast4'>,
    AadhaarPlaintext {}

export interface UpdateAdmissionArgs
  extends Omit<UpdateAdmissionInput, 'aadhaarEncrypted' | 'aadhaarLast4'>,
    AadhaarPlaintext {}

export interface ListAdmissionsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: AdmissionStatusValue;
  readonly targetAcademicYearId?: string;
  readonly targetClassId?: string;
  readonly q?: string;
}

export interface ApproveAdmissionArgs {
  /** Optional roll-number override at approval time. */
  readonly rollNo?: string | null;
  /** Optional admitted-on date; defaults to the approval timestamp. */
  readonly admittedOn?: Date;
  /** Optional emergency contacts (max 5); defaults to empty array. */
  readonly emergencyContacts?: readonly EmergencyContact[];
  /** Free-form decision note copied to history + row. */
  readonly decisionNote?: string | null;
}

export interface DecisionArgs {
  readonly decisionNote?: string | null;
}

@Injectable()
export class AdmissionService {
  private readonly logger = new Logger(AdmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AdmissionRepository,
    private readonly historyRepo: AdmissionHistoryRepository,
    private readonly studentService: StudentService,
    private readonly parentService: ParentService,
    private readonly crypto: CryptoService,
  ) {}

  public async list(
    args: ListAdmissionsArgs,
  ): Promise<{ readonly items: readonly AdmissionRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<AdmissionRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Admission', id);
    }
    return row;
  }

  public async listHistory(id: string): Promise<readonly AdmissionHistoryRow[]> {
    const admission = await this.repo.findById(id);
    if (admission === null) {
      throw new NotFoundError('Admission', id);
    }
    return this.historyRepo.findByAdmission(id);
  }

  public async create(args: CreateAdmissionArgs): Promise<AdmissionRow> {
    return this.prisma.transaction(async (tx) => {
      const created = await this.repo.create(this.toCreateInput(args), tx);
      await this.historyRepo.append(
        { admissionId: created.id, fromStatus: null, toStatus: 'DRAFT' },
        tx,
      );
      return created;
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateAdmissionArgs,
  ): Promise<AdmissionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Admission', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Admission', id, expectedVersion);
      }
      if (current.status !== 'DRAFT') {
        throw new InvalidAdmissionTransitionError({
          admissionId: id,
          from: current.status,
          attempted: 'update',
        });
      }
      return this.repo.update(id, expectedVersion, this.toUpdateInput(patch), tx);
    });
  }

  public async submit(id: string, expectedVersion: number): Promise<AdmissionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.assertEditable(id, expectedVersion, 'submit', tx);
      if (current.status !== 'DRAFT') {
        throw new InvalidAdmissionTransitionError({
          admissionId: id,
          from: current.status,
          attempted: 'submit',
        });
      }
      const updated = await this.repo.markSubmitted(id, expectedVersion, tx);
      await this.historyRepo.append(
        { admissionId: id, fromStatus: 'DRAFT', toStatus: 'SUBMITTED' },
        tx,
      );
      this.logger.log(`Submitted Admission ${id}.`);
      return updated;
    });
  }

  public async withdraw(
    id: string,
    expectedVersion: number,
    args: DecisionArgs = {},
  ): Promise<AdmissionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.assertEditable(id, expectedVersion, 'withdraw', tx);
      if (current.status !== 'DRAFT' && current.status !== 'SUBMITTED') {
        throw new InvalidAdmissionTransitionError({
          admissionId: id,
          from: current.status,
          attempted: 'withdraw',
        });
      }
      const updated = await this.repo.markWithdrawn(
        id,
        expectedVersion,
        { decidedBy: this.actorId(), decisionNote: args.decisionNote ?? null },
        tx,
      );
      await this.historyRepo.append(
        {
          admissionId: id,
          fromStatus: current.status,
          toStatus: 'WITHDRAWN',
          note: args.decisionNote ?? null,
        },
        tx,
      );
      this.logger.log(`Withdrew Admission ${id} from ${current.status}.`);
      return updated;
    });
  }

  public async reject(
    id: string,
    expectedVersion: number,
    args: DecisionArgs = {},
  ): Promise<AdmissionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.assertEditable(id, expectedVersion, 'reject', tx);
      if (current.status !== 'SUBMITTED') {
        throw new InvalidAdmissionTransitionError({
          admissionId: id,
          from: current.status,
          attempted: 'reject',
        });
      }
      const updated = await this.repo.markRejected(
        id,
        expectedVersion,
        { decidedBy: this.actorId(), decisionNote: args.decisionNote ?? null },
        tx,
      );
      await this.historyRepo.append(
        {
          admissionId: id,
          fromStatus: 'SUBMITTED',
          toStatus: 'REJECTED',
          note: args.decisionNote ?? null,
        },
        tx,
      );
      this.logger.log(`Rejected Admission ${id}.`);
      return updated;
    });
  }

  /**
   * Promote a SUBMITTED admission to APPROVED. Inside one transaction:
   *   1. Validate the admission snapshot (admissionNo, target placement).
   *   2. Create the Parent row from the snapshot.
   *   3. Create the Student row from the snapshot.
   *   4. Link the Parent to the Student in the appropriate slot.
   *   5. Mark the admission APPROVED, attaching student/parent ids.
   *   6. Append a history row.
   */
  public async approve(
    id: string,
    expectedVersion: number,
    args: ApproveAdmissionArgs = {},
  ): Promise<{
    readonly admission: AdmissionRow;
    readonly student: StudentRow;
    readonly parent: ParentRow;
    readonly link: ParentStudentLinkRow;
  }> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.assertEditable(id, expectedVersion, 'approve', tx);
      if (current.status !== 'SUBMITTED') {
        if (ADMISSION_TERMINAL_STATES.includes(current.status)) {
          throw new AdmissionAlreadyDecidedError({ admissionId: id, status: current.status });
        }
        throw new InvalidAdmissionTransitionError({
          admissionId: id,
          from: current.status,
          attempted: 'approve',
        });
      }
      assertApprovable(current);

      const parent = await this.parentService.create(
        {
          fatherName: current.fatherName,
          fatherPhone: current.fatherPhone,
          fatherEmail: current.fatherEmail,
          fatherOccupation: current.fatherOccupation,
          motherName: current.motherName,
          motherPhone: current.motherPhone,
          motherEmail: current.motherEmail,
          motherOccupation: current.motherOccupation,
          guardianName: current.guardianName,
          guardianPhone: current.guardianPhone,
          guardianEmail: current.guardianEmail,
          guardianOccupation: current.guardianOccupation,
          guardianRelation: current.guardianRelation,
          addressLine1: current.addressLine1,
          addressLine2: current.addressLine2,
          city: current.city,
          state: current.state,
          postalCode: current.postalCode,
          country: current.country,
        },
        tx,
      );

      const rollNo =
        args.rollNo !== undefined ? args.rollNo : current.rollNo;
      const student = await this.studentService.create(
        {
          firstName: current.firstName,
          lastName: current.lastName,
          dateOfBirth: current.dateOfBirth,
          gender: current.gender as GenderValue,
          bloodGroup: current.bloodGroup,
          admissionNo: current.admissionNo as string,
          ...(rollNo !== null && rollNo !== undefined ? { rollNo } : {}),
          academicYearId: current.targetAcademicYearId,
          classId: current.targetClassId,
          sectionId: current.targetSectionId,
          admittedOn: args.admittedOn ?? new Date(),
          status: 'ACTIVE',
          emergencyContacts: args.emergencyContacts ?? [],
          religion: current.religion,
          category: current.category,
          nationality: current.nationality,
          motherTongue: current.motherTongue,
          apaarId: current.apaarId,
          isCwsn: current.isCwsn,
          disabilityType: current.disabilityType,
          isRte: current.isRte,
          isMinority: current.isMinority,
          minorityCommunity: current.minorityCommunity,
          isBpl: current.isBpl,
          previousSchoolName: current.previousSchoolName,
          previousSchoolTcNo: current.previousSchoolTcNo,
          previousSchoolTcDate: current.previousSchoolTcDate,
          admissionType: current.admissionType,
          placeOfBirth: current.placeOfBirth,
          birthCertNo: current.birthCertNo,
        },
        tx,
      );

      const link = await this.parentService.linkStudent(
        parent.id,
        {
          studentId: student.id,
          relation: pickPrimaryRelation(current),
          isPrimaryContact: true,
        },
        tx,
      );

      const updated = await this.repo.markApproved(
        id,
        expectedVersion,
        {
          studentId: student.id,
          parentId: parent.id,
          decidedBy: this.actorId(),
          decisionNote: args.decisionNote ?? null,
        },
        tx,
      );
      await this.historyRepo.append(
        {
          admissionId: id,
          fromStatus: 'SUBMITTED',
          toStatus: 'APPROVED',
          note: args.decisionNote ?? null,
        },
        tx,
      );
      this.logger.log(
        `Approved Admission ${id} → Student ${student.id}, Parent ${parent.id}.`,
      );
      return { admission: updated, student, parent, link };
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Admission', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Admission', id, expectedVersion);
      }
      if (
        current.status !== 'DRAFT' &&
        current.status !== 'REJECTED' &&
        current.status !== 'WITHDRAWN'
      ) {
        throw new AdmissionNotDeletableError({ admissionId: id, status: current.status });
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Soft-deleted Admission ${id}.`);
    });
  }

  private async assertEditable(
    id: string,
    expectedVersion: number,
    attempted: 'submit' | 'approve' | 'reject' | 'withdraw',
    tx: PrismaTx,
  ): Promise<AdmissionRow> {
    const current = await this.repo.findById(id, tx);
    if (current === null) {
      throw new NotFoundError('Admission', id);
    }
    if (current.version !== expectedVersion) {
      throw new VersionConflict('Admission', id, expectedVersion);
    }
    if (ADMISSION_TERMINAL_STATES.includes(current.status)) {
      throw new AdmissionAlreadyDecidedError({ admissionId: id, status: current.status });
    }
    void attempted;
    return current;
  }

  private actorId(): string | null {
    return RequestContextRegistry.require().userId ?? null;
  }

  private toCreateInput(args: CreateAdmissionArgs): CreateAdmissionInput {
    const { aadhaar: _drop, ...rest } = args;
    void _drop;
    return { ...rest, ...this.sealAadhaar(args) } as CreateAdmissionInput;
  }

  private toUpdateInput(args: UpdateAdmissionArgs): UpdateAdmissionInput {
    const { aadhaar: _drop, ...rest } = args;
    void _drop;
    return { ...rest, ...this.sealAadhaar(args) } as UpdateAdmissionInput;
  }

  private sealAadhaar(args: AadhaarPlaintext): Partial<AdmissionIndianFields> {
    if (args.aadhaar === undefined) return {};
    if (args.aadhaar === null || args.aadhaar === '') {
      return { aadhaarEncrypted: null, aadhaarLast4: null };
    }
    const last4 = this.crypto.last4(args.aadhaar);
    return {
      aadhaarEncrypted: this.crypto.sealString(args.aadhaar),
      aadhaarLast4: last4 === '' ? null : last4,
    };
  }
}

function assertApprovable(row: AdmissionRow): void {
  const missing: string[] = [];
  if (row.admissionNo === null || row.admissionNo.trim() === '') {
    missing.push('admissionNo');
  }
  if (row.targetAcademicYearId === '') missing.push('targetAcademicYearId');
  if (row.targetClassId === '') missing.push('targetClassId');
  if (row.targetSectionId === '') missing.push('targetSectionId');
  const hasParentContact =
    nonEmpty(row.fatherPhone) || nonEmpty(row.motherPhone) || nonEmpty(row.guardianPhone);
  if (!hasParentContact) missing.push('parentPhone');
  if (missing.length > 0) {
    throw new AdmissionNotApprovableError(missing);
  }
}

function pickPrimaryRelation(row: AdmissionRow): 'FATHER' | 'MOTHER' | 'GUARDIAN' {
  if (nonEmpty(row.fatherName) || nonEmpty(row.fatherPhone)) return 'FATHER';
  if (nonEmpty(row.motherName) || nonEmpty(row.motherPhone)) return 'MOTHER';
  return 'GUARDIAN';
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}
