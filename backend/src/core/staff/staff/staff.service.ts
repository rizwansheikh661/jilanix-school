/**
 * StaffService — master Staff CRUD + lifecycle state machine.
 *
 * Status transitions:
 *   ACTIVE ↔ INACTIVE (deactivate / reactivate)
 *   ACTIVE/INACTIVE → RESIGNED | TERMINATED | RETIRED (terminal — set
 *   via `setTerminalStatus` only; not exposed in Sprint 4 routes)
 *
 * Lifecycle hooks write a row to `staff_employment_history` inside the
 * same transaction as the status change so the audit chain matches the
 * actual workflow state.
 *
 * PII columns (PAN / Aadhaar / bank account) are sealed with
 * `CryptoService.sealString` on write and surfaced as `_last4` only on
 * standard reads. The unmasked values are returned exclusively by
 * `getPii(id)` which the controller gates behind `staff.pii.read`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '../../../infra/crypto';
import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { ConflictError, NotFoundError, VersionConflict } from '../../errors/domain-error';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES, SequenceService } from '../../sequences';
import { SubscriptionGuardService } from '../../subscription';
import type { GenderValue } from '../../student';
import { StaffEmploymentHistoryRepository } from '../repositories/staff-employment-history.repository';
import {
  StaffRepository,
  type CreateStaffInput,
  type ListStaffArgs,
  type UpdateStaffInput,
} from '../repositories/staff.repository';
import { StaffStatusInvalidTransitionError } from '../staff.errors';
import type {
  StaffPiiRow,
  StaffPublicRow,
  StaffRow,
  StaffStatusValue,
} from '../staff.types';

export interface CreateStaffArgs {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date | null;
  readonly gender: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly email?: string | null;
  readonly phone: string;
  readonly alternatePhone?: string | null;
  /** Plain Aadhaar — will be sealed before storage. */
  readonly aadhaar?: string | null;
  /** Plain PAN — will be sealed before storage. */
  readonly pan?: string | null;
  readonly addressLine1: string;
  readonly addressLine2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country?: string;
  readonly designation: string;
  readonly department?: string | null;
  readonly dateOfJoining: Date;
  /** Plain bank account — will be sealed before storage. */
  readonly bankAccount?: string | null;
  readonly bankIfsc?: string | null;
  readonly userId?: string | null;
}

export interface UpdateStaffArgs {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date | null;
  readonly gender?: GenderValue;
  readonly bloodGroup?: string | null;
  readonly photoUrl?: string | null;
  readonly email?: string | null;
  readonly phone?: string;
  readonly alternatePhone?: string | null;
  readonly aadhaar?: string | null;
  readonly pan?: string | null;
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
  readonly bankAccount?: string | null;
  readonly bankIfsc?: string | null;
  readonly userId?: string | null;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StaffRepository,
    private readonly historyRepo: StaffEmploymentHistoryRepository,
    private readonly sequences: SequenceService,
    private readonly crypto: CryptoService,
    private readonly guard: SubscriptionGuardService,
  ) {}

  public async list(
    args: ListStaffArgs,
  ): Promise<{ readonly items: readonly StaffPublicRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows.map(stripPii), nextCursorId };
  }

  public async getById(id: string): Promise<StaffPublicRow> {
    const row = await this.getOrThrow(id);
    return stripPii(row);
  }

  /** PII-enriched view; controller MUST gate this with `staff.pii.read`. */
  public async getPii(id: string): Promise<StaffPiiRow> {
    const row = await this.getOrThrow(id);
    return {
      ...stripPii(row),
      aadhaar: row.aadhaarEncrypted === null ? null : this.crypto.openString(row.aadhaarEncrypted),
      pan: row.panEncrypted === null ? null : this.crypto.openString(row.panEncrypted),
      bankAccount:
        row.bankAccountEncrypted === null
          ? null
          : this.crypto.openString(row.bankAccountEncrypted),
    };
  }

  public async create(args: CreateStaffArgs): Promise<StaffPublicRow> {
    return this.prisma.transaction(async (tx) => {
      const employeeCode = String(
        await this.sequences.nextValue(SEQ_NAMES.EMPLOYEE, { tx }),
      );
      const input: CreateStaffInput = {
        firstName: args.firstName,
        lastName: args.lastName,
        dateOfBirth: args.dateOfBirth ?? null,
        gender: args.gender,
        bloodGroup: args.bloodGroup ?? null,
        photoUrl: args.photoUrl ?? null,
        email: args.email ?? null,
        phone: args.phone,
        alternatePhone: args.alternatePhone ?? null,
        ...sealField(this.crypto, 'aadhaar', args.aadhaar),
        ...sealField(this.crypto, 'pan', args.pan),
        ...sealField(this.crypto, 'bankAccount', args.bankAccount),
        addressLine1: args.addressLine1,
        addressLine2: args.addressLine2 ?? null,
        city: args.city,
        state: args.state,
        postalCode: args.postalCode,
        ...(args.country !== undefined ? { country: args.country } : {}),
        employeeCode,
        designation: args.designation,
        department: args.department ?? null,
        dateOfJoining: args.dateOfJoining,
        status: 'ACTIVE',
        bankIfsc: args.bankIfsc ?? null,
        userId: args.userId ?? null,
      };
      const row = await this.repo.create(input, tx);
      await this.historyRepo.append(
        {
          staffId: row.id,
          event: 'JOINED',
          effectiveDate: args.dateOfJoining,
          toValue: args.designation,
        },
        tx,
      );
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.assertAndConsume(schoolId, 'staff_count', 1, `staff:${row.id}`, tx);
      }
      this.logger.log(`Created Staff ${row.id} (employeeCode=${employeeCode}).`);
      return stripPii(row);
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateStaffArgs,
  ): Promise<StaffPublicRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new NotFoundError('Staff', id);
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Staff', id, expectedVersion);
      }
      const input: UpdateStaffInput = {
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.dateOfBirth !== undefined ? { dateOfBirth: patch.dateOfBirth } : {}),
        ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
        ...(patch.bloodGroup !== undefined ? { bloodGroup: patch.bloodGroup } : {}),
        ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.alternatePhone !== undefined ? { alternatePhone: patch.alternatePhone } : {}),
        ...(patch.aadhaar !== undefined ? sealField(this.crypto, 'aadhaar', patch.aadhaar) : {}),
        ...(patch.pan !== undefined ? sealField(this.crypto, 'pan', patch.pan) : {}),
        ...(patch.bankAccount !== undefined
          ? sealField(this.crypto, 'bankAccount', patch.bankAccount)
          : {}),
        ...(patch.addressLine1 !== undefined ? { addressLine1: patch.addressLine1 } : {}),
        ...(patch.addressLine2 !== undefined ? { addressLine2: patch.addressLine2 } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.postalCode !== undefined ? { postalCode: patch.postalCode } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.designation !== undefined ? { designation: patch.designation } : {}),
        ...(patch.department !== undefined ? { department: patch.department } : {}),
        ...(patch.dateOfJoining !== undefined ? { dateOfJoining: patch.dateOfJoining } : {}),
        ...(patch.dateOfLeaving !== undefined ? { dateOfLeaving: patch.dateOfLeaving } : {}),
        ...(patch.bankIfsc !== undefined ? { bankIfsc: patch.bankIfsc } : {}),
        ...(patch.userId !== undefined ? { userId: patch.userId } : {}),
      };
      const updated = await this.repo.update(id, expectedVersion, input, tx);
      if (patch.designation !== undefined && patch.designation !== current.designation) {
        await this.historyRepo.append(
          {
            staffId: id,
            event: 'ROLE_CHANGED',
            effectiveDate: new Date(),
            fromValue: current.designation,
            toValue: patch.designation,
          },
          tx,
        );
      }
      if (patch.department !== undefined && patch.department !== current.department) {
        await this.historyRepo.append(
          {
            staffId: id,
            event: 'DEPARTMENT_CHANGED',
            effectiveDate: new Date(),
            fromValue: current.department,
            toValue: patch.department,
          },
          tx,
        );
      }
      return stripPii(updated);
    });
  }

  public async deactivate(id: string, expectedVersion: number): Promise<StaffPublicRow> {
    return this.transitionStatus(id, expectedVersion, 'INACTIVE');
  }

  public async reactivate(id: string, expectedVersion: number): Promise<StaffPublicRow> {
    return this.transitionStatus(id, expectedVersion, 'ACTIVE');
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new NotFoundError('Staff', id);
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Staff', id, expectedVersion);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      const schoolId = RequestContextRegistry.peek()?.schoolId;
      if (schoolId !== undefined) {
        await this.guard.releaseUsage(schoolId, 'staff_count', 1, `staff:${id}`, tx);
      }
      this.logger.log(`Soft-deleted Staff ${id}.`);
    });
  }

  /** Internal: assert staff exists (consumed by sub-resource services). */
  public async assertExists(id: string, tx?: PrismaTx): Promise<StaffRow> {
    const row = await this.repo.findById(id, tx);
    if (row === null) throw new NotFoundError('Staff', id);
    return row;
  }

  private async transitionStatus(
    id: string,
    expectedVersion: number,
    nextStatus: StaffStatusValue,
  ): Promise<StaffPublicRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new NotFoundError('Staff', id);
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Staff', id, expectedVersion);
      }
      if (!isAllowedStatusTransition(current.status, nextStatus)) {
        throw new StaffStatusInvalidTransitionError({
          staffId: id,
          currentStatus: current.status,
          attemptedStatus: nextStatus,
        });
      }
      if (current.status === nextStatus) {
        throw new ConflictError(`Staff ${id} is already ${nextStatus}.`);
      }
      const updated = await this.repo.setStatus(id, expectedVersion, nextStatus, {}, tx);
      const event =
        nextStatus === 'INACTIVE'
          ? 'ROLE_CHANGED'
          : nextStatus === 'ACTIVE'
            ? 'REJOINED'
            : null;
      if (event !== null) {
        await this.historyRepo.append(
          {
            staffId: id,
            event,
            effectiveDate: new Date(),
            fromValue: current.status,
            toValue: nextStatus,
          },
          tx,
        );
      }
      this.logger.log(`Staff ${id}: ${current.status} → ${nextStatus}.`);
      return stripPii(updated);
    });
  }

  private async getOrThrow(id: string): Promise<StaffRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new NotFoundError('Staff', id);
    return row;
  }
}

function stripPii(row: StaffRow): StaffPublicRow {
  const {
    panEncrypted: _pan,
    aadhaarEncrypted: _aad,
    bankAccountEncrypted: _bank,
    ...rest
  } = row;
  void _pan;
  void _aad;
  void _bank;
  return rest;
}

type SealKey = 'aadhaar' | 'pan' | 'bankAccount';
type SealOutput =
  | { aadhaarEncrypted: string | null; aadhaarLast4: string | null }
  | { panEncrypted: string | null; panLast4: string | null }
  | { bankAccountEncrypted: string | null; bankAccountLast4: string | null };

function sealField(crypto: CryptoService, key: SealKey, raw: string | null | undefined): SealOutput {
  if (raw === null || raw === undefined || raw === '') {
    if (key === 'aadhaar') return { aadhaarEncrypted: null, aadhaarLast4: null };
    if (key === 'pan') return { panEncrypted: null, panLast4: null };
    return { bankAccountEncrypted: null, bankAccountLast4: null };
  }
  const sealed = crypto.sealString(raw);
  const last4 = crypto.last4(raw);
  const last4OrNull = last4 === '' ? null : last4;
  if (key === 'aadhaar') return { aadhaarEncrypted: sealed, aadhaarLast4: last4OrNull };
  if (key === 'pan') return { panEncrypted: sealed, panLast4: last4OrNull };
  return { bankAccountEncrypted: sealed, bankAccountLast4: last4OrNull };
}

/**
 * Allowed status transitions for the deactivate/reactivate routes
 * shipped in Sprint 4. Terminal statuses (RESIGNED / TERMINATED /
 * RETIRED) are write-blocked here — a future sprint exposes the
 * separation endpoint.
 */
function isAllowedStatusTransition(
  from: StaffStatusValue,
  to: StaffStatusValue,
): boolean {
  if (from === 'RESIGNED' || from === 'TERMINATED' || from === 'RETIRED') return false;
  if (to !== 'ACTIVE' && to !== 'INACTIVE') return false;
  return true;
}

export const __test__ = { stripPii, sealField, isAllowedStatusTransition };

export type { ListStaffArgs };
