/**
 * SchoolSettingsRepository — persistence for the TENANT_OWNED
 * `school_settings` row. Exactly one row per school (enforced by the
 * `(school_id)` unique constraint), so semantics are upsert-shaped:
 *
 *   - findForCurrentSchool() — returns null when the row hasn't been
 *                              materialised yet.
 *   - createDefaultsForCurrentSchool() — creates a default row for the
 *                              tenant on the request context.
 *   - update(expectedVersion, patch) — patches the existing row with
 *                              optimistic concurrency.
 *
 * Tenant context: every method routes through `RequestContextRegistry`
 * to resolve `schoolId`. The `schoolScope` Prisma extension also stamps
 * a where-clause on TENANT_OWNED reads, so the explicit `schoolId` filter
 * here is belt-and-braces.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import { DEFAULT_WORKING_DAYS, type SchoolSettingsRow, type WorkingDaysJson } from './school-settings.types';

export interface UpdateSchoolSettingsInput {
  readonly workingDaysJson?: WorkingDaysJson;
  readonly attendanceWindowHours?: number;
  readonly examEditWindowHours?: number;
  readonly invoiceNumberFormat?: string;
  readonly defaultCommunicationLanguage?: string;
  readonly quietHoursStart?: string | null;
  readonly quietHoursEnd?: string | null;
  readonly privacyPolicyVersion?: string | null;
  readonly privacyPolicyAcceptedAt?: Date | null;
}

@Injectable()
export class SchoolSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string; userId: string | null } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SchoolSettingsRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? null };
  }

  public async findForCurrentSchool(tx?: PrismaTx): Promise<SchoolSettingsRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.schoolSettings.findFirst({ where: { schoolId } });
    return row === null ? null : mapRow(row as unknown as RawSettings);
  }

  public async createDefaultsForCurrentSchool(tx?: PrismaTx): Promise<SchoolSettingsRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenantContext();
    const created = await writer.schoolSettings.create({
      data: {
        id: randomUUID(),
        schoolId,
        workingDaysJson: DEFAULT_WORKING_DAYS as unknown as never,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return mapRow(created as unknown as RawSettings);
  }

  public async update(
    expectedVersion: number,
    patch: UpdateSchoolSettingsInput,
    tx?: PrismaTx,
  ): Promise<SchoolSettingsRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenantContext();
    const existing = await writer.schoolSettings.findFirst({ where: { schoolId } });
    if (existing === null) {
      throw new VersionConflictError('SchoolSettings', '(current)', expectedVersion);
    }
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.workingDaysJson !== undefined) {
      data.workingDaysJson = patch.workingDaysJson as unknown;
    }
    const scalarFields: ReadonlyArray<Exclude<keyof UpdateSchoolSettingsInput, 'workingDaysJson'>> = [
      'attendanceWindowHours',
      'examEditWindowHours',
      'invoiceNumberFormat',
      'defaultCommunicationLanguage',
      'quietHoursStart',
      'quietHoursEnd',
      'privacyPolicyVersion',
      'privacyPolicyAcceptedAt',
    ];
    for (const k of scalarFields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.schoolSettings.updateMany({
      where: { schoolId, id: existing.id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolSettings', existing.id, expectedVersion);
    }
    const reloaded = await writer.schoolSettings.findUnique({
      where: { schoolId_id: { schoolId, id: existing.id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('SchoolSettings', existing.id, expectedVersion);
    }
    return mapRow(reloaded as unknown as RawSettings);
  }
}

interface RawSettings {
  id: string;
  schoolId: string;
  workingDaysJson: unknown;
  attendanceWindowHours: number;
  examEditWindowHours: number;
  invoiceNumberFormat: string;
  defaultCommunicationLanguage: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  privacyPolicyVersion: string | null;
  privacyPolicyAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapRow(row: RawSettings): SchoolSettingsRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    workingDaysJson: coerceWorkingDays(row.workingDaysJson),
    attendanceWindowHours: row.attendanceWindowHours,
    examEditWindowHours: row.examEditWindowHours,
    invoiceNumberFormat: row.invoiceNumberFormat,
    defaultCommunicationLanguage: row.defaultCommunicationLanguage,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    privacyPolicyVersion: row.privacyPolicyVersion,
    privacyPolicyAcceptedAt: row.privacyPolicyAcceptedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

function coerceWorkingDays(raw: unknown): WorkingDaysJson {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_WORKING_DAYS };
  const obj = raw as Record<string, unknown>;
  return {
    mon: bool(obj['mon'], true),
    tue: bool(obj['tue'], true),
    wed: bool(obj['wed'], true),
    thu: bool(obj['thu'], true),
    fri: bool(obj['fri'], true),
    sat: bool(obj['sat'], true),
    sun: bool(obj['sun'], false),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
