/**
 * SchoolRepository (root) — persistence for the platform `schools` row.
 *
 * The `schools` table is `PLATFORM_ONLY` scope (see `infra/prisma/scope.ts`),
 * so the tenant-scope extension does NOT auto-stamp a `schoolId` filter on
 * these queries. That makes this repository safe to call from the
 * `/super-admin/schools` path without a tenant context bound on the request.
 *
 * Wave 3 surface:
 *   - findById              — read one
 *   - findBySlug            — slug lookup (super-admin lookup helper)
 *   - list                  — cursor-paginated list with optional filters
 *   - updateLegalContact    — PATCH (legal/contact fields only; no lifecycle)
 *
 * Lifecycle transitions (trial extend, suspend, cancel, plan assign) land
 * in Wave 4-6 on dedicated lifecycle / plan-assignment services.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SchoolLifecycleStatusValue, SchoolPlanStatusValue, SchoolRootRow } from './school.types';

export interface UpdateSchoolLegalContactInput {
  readonly legalName?: string;
  readonly displayName?: string;
  readonly gstin?: string | null;
  readonly pan?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly pincode?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly website?: string | null;
  readonly timezone?: string;
  readonly localeDefault?: string;
}

export interface ListSchoolsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly lifecycleStatus?: SchoolLifecycleStatusValue;
  readonly planId?: string;
  readonly slugSearch?: string;
  readonly includeDeleted?: boolean;
}

export interface CreateSchoolInput {
  readonly id?: string;
  readonly slug: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly countryCode?: string;
  readonly gstin?: string | null;
  readonly pan?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly timezone?: string;
  readonly localeDefault?: string;
  readonly lifecycleStatus?: SchoolLifecycleStatusValue;
  readonly trialStartDate?: Date | null;
  readonly trialEndDate?: Date | null;
  readonly planId?: string | null;
  readonly planAssignedAt?: Date | null;
  readonly planExpiresAt?: Date | null;
  readonly planStatus?: SchoolPlanStatusValue | null;
  readonly status?: string;
  readonly createdBy?: string | null;
}

export interface UpdateLifecycleInput {
  readonly lifecycleStatus: SchoolLifecycleStatusValue;
  readonly status?: string;
  readonly suspendedAt?: Date | null;
  readonly suspendedReason?: string | null;
  readonly cancelledAt?: Date | null;
  readonly onboardedAt?: Date | null;
  readonly planStatus?: SchoolPlanStatusValue | null;
  readonly trialEndDate?: Date | null;
}

export interface UpdateTrialInput {
  readonly trialEndDate: Date;
  readonly trialExtendedCount: number;
}

export interface UpdatePlanAssignmentInput {
  readonly planId: string;
  readonly planAssignedAt: Date;
  readonly planExpiresAt: Date | null;
  readonly planStatus: SchoolPlanStatusValue;
}

@Injectable()
export class SchoolRootRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  public async findById(id: string, tx?: PrismaTx): Promise<SchoolRootRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.school.findFirst({ where: { id, deletedAt: null } });
    return row === null ? null : mapRow(row as unknown as RawSchool);
  }

  public async findBySlug(slug: string, tx?: PrismaTx): Promise<SchoolRootRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.school.findFirst({ where: { slug, deletedAt: null } });
    return row === null ? null : mapRow(row as unknown as RawSchool);
  }

  public async list(
    args: ListSchoolsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly SchoolRootRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = {};
    if (args.includeDeleted !== true) where.deletedAt = null;
    if (args.lifecycleStatus !== undefined) where.lifecycleStatus = args.lifecycleStatus;
    if (args.planId !== undefined) where.planId = args.planId;
    if (args.slugSearch !== undefined && args.slugSearch.length > 0) {
      where.slug = { contains: args.slugSearch };
    }
    const rows = await reader.school.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined ? { cursor: { id: args.cursorId }, skip: 1 } : {}),
    });
    const nextCursorId = rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawSchool)),
      nextCursorId,
    };
  }

  public async create(input: CreateSchoolInput, tx?: PrismaTx): Promise<SchoolRootRow> {
    const writer = this.resolve(tx);
    const data: Record<string, unknown> = {
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
      countryCode: input.countryCode ?? 'IN',
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      timezone: input.timezone ?? 'Asia/Kolkata',
      localeDefault: input.localeDefault ?? 'en-IN',
      status: input.status ?? 'trial',
      lifecycleStatus: input.lifecycleStatus ?? 'TRIAL',
      trialStartDate: input.trialStartDate ?? null,
      trialEndDate: input.trialEndDate ?? null,
      planId: input.planId ?? null,
      planAssignedAt: input.planAssignedAt ?? null,
      planExpiresAt: input.planExpiresAt ?? null,
      planStatus: input.planStatus ?? null,
      createdBy: input.createdBy ?? this.currentUserId(),
      updatedBy: input.createdBy ?? this.currentUserId(),
    };
    if (input.id !== undefined) data.id = input.id;
    const created = await writer.school.create({ data: data as never });
    return mapRow(created as unknown as RawSchool);
  }

  public async updateLifecycle(
    id: string,
    expectedVersion: number,
    patch: UpdateLifecycleInput,
    tx?: PrismaTx,
  ): Promise<SchoolRootRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      lifecycleStatus: patch.lifecycleStatus,
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.suspendedAt !== undefined) data.suspendedAt = patch.suspendedAt;
    if (patch.suspendedReason !== undefined) data.suspendedReason = patch.suspendedReason;
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;
    if (patch.onboardedAt !== undefined) data.onboardedAt = patch.onboardedAt;
    if (patch.planStatus !== undefined) data.planStatus = patch.planStatus;
    if (patch.trialEndDate !== undefined) data.trialEndDate = patch.trialEndDate;
    const result = await writer.school.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('School', id, expectedVersion);
    }
    const reloaded = await writer.school.findUnique({ where: { id } });
    if (reloaded === null) throw new VersionConflictError('School', id, expectedVersion);
    return mapRow(reloaded as unknown as RawSchool);
  }

  public async updateTrial(
    id: string,
    expectedVersion: number,
    patch: UpdateTrialInput,
    tx?: PrismaTx,
  ): Promise<SchoolRootRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.school.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        trialEndDate: patch.trialEndDate,
        trialExtendedCount: patch.trialExtendedCount,
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('School', id, expectedVersion);
    }
    const reloaded = await writer.school.findUnique({ where: { id } });
    if (reloaded === null) throw new VersionConflictError('School', id, expectedVersion);
    return mapRow(reloaded as unknown as RawSchool);
  }

  public async updatePlanAssignment(
    id: string,
    expectedVersion: number,
    patch: UpdatePlanAssignmentInput,
    tx?: PrismaTx,
  ): Promise<SchoolRootRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.school.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        planId: patch.planId,
        planAssignedAt: patch.planAssignedAt,
        planExpiresAt: patch.planExpiresAt,
        planStatus: patch.planStatus,
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('School', id, expectedVersion);
    }
    const reloaded = await writer.school.findUnique({ where: { id } });
    if (reloaded === null) throw new VersionConflictError('School', id, expectedVersion);
    return mapRow(reloaded as unknown as RawSchool);
  }

  /**
   * Scan for TRIAL schools whose trial_end_date is on or before `now`. Used
   * by the trial-expiry job to detect schools needing the EXPIRED transition.
   * Returns up to `limit` rows ordered by trial_end_date ascending so the
   * oldest expirations process first.
   */
  public async findExpiringTrials(
    args: { readonly now: Date; readonly limit: number },
    tx?: PrismaTx,
  ): Promise<readonly SchoolRootRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.school.findMany({
      where: {
        lifecycleStatus: 'TRIAL',
        deletedAt: null,
        trialEndDate: { lte: args.now },
      },
      orderBy: [{ trialEndDate: 'asc' }, { id: 'asc' }],
      take: args.limit,
    });
    return rows.map((r) => mapRow(r as unknown as RawSchool));
  }

  /**
   * Sprint 14.1 — scan for TRIAL schools whose trial_end_date falls in the
   * open `(now, until]` window. Used by the trial-expiry job to fire
   * `TRIAL_EXPIRING` warning events ahead of the actual expiry.
   */
  public async findUpcomingTrialExpirations(
    args: { readonly now: Date; readonly until: Date; readonly limit: number },
    tx?: PrismaTx,
  ): Promise<readonly SchoolRootRow[]> {
    const reader = this.resolve(tx);
    const rows = await reader.school.findMany({
      where: {
        lifecycleStatus: 'TRIAL',
        deletedAt: null,
        trialEndDate: { gt: args.now, lte: args.until },
      },
      orderBy: [{ trialEndDate: 'asc' }, { id: 'asc' }],
      take: args.limit,
    });
    return rows.map((r) => mapRow(r as unknown as RawSchool));
  }

  public async updateLegalContact(
    id: string,
    expectedVersion: number,
    patch: UpdateSchoolLegalContactInput,
    tx?: PrismaTx,
  ): Promise<SchoolRootRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    const fields: ReadonlyArray<keyof UpdateSchoolLegalContactInput> = [
      'legalName',
      'displayName',
      'gstin',
      'pan',
      'addressLine1',
      'addressLine2',
      'city',
      'stateCode',
      'pincode',
      'phone',
      'email',
      'website',
      'timezone',
      'localeDefault',
    ];
    for (const k of fields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.school.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('School', id, expectedVersion);
    }
    const reloaded = await writer.school.findUnique({ where: { id } });
    if (reloaded === null) {
      throw new VersionConflictError('School', id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawSchool);
  }
}

interface RawSchool {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string;
  localeDefault: string;
  status: string;
  onboardedAt: Date | null;
  archivedAt: Date | null;
  lifecycleStatus: string;
  trialStartDate: Date | null;
  trialEndDate: Date | null;
  trialExtendedCount: number;
  planId: string | null;
  planAssignedAt: Date | null;
  planExpiresAt: Date | null;
  planStatus: string | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawSchool): SchoolRootRow {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legalName,
    displayName: row.displayName,
    countryCode: row.countryCode,
    gstin: row.gstin,
    pan: row.pan,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateCode: row.stateCode,
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    website: row.website,
    timezone: row.timezone,
    localeDefault: row.localeDefault,
    status: row.status,
    onboardedAt: row.onboardedAt,
    archivedAt: row.archivedAt,
    lifecycleStatus: row.lifecycleStatus as SchoolLifecycleStatusValue,
    trialStartDate: row.trialStartDate,
    trialEndDate: row.trialEndDate,
    trialExtendedCount: row.trialExtendedCount,
    planId: row.planId,
    planAssignedAt: row.planAssignedAt,
    planExpiresAt: row.planExpiresAt,
    planStatus: row.planStatus === null ? null : (row.planStatus as SchoolPlanStatusValue),
    suspendedAt: row.suspendedAt,
    suspendedReason: row.suspendedReason,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
