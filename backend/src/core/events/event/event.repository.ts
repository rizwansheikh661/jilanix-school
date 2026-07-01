/**
 * EventRepository — persistence for `events` rows.
 *
 * Soft-delete + active-uniqueness on `(schoolId, code)` enforced at DB level
 * via STORED `deleted_at_key` partial unique. Repo pre-checks for duplicates
 * to surface friendlier domain errors before tripping the constraint.
 *
 * Counter columns (`registeredCount`, `attendedCount`, `absentCount`) are
 * maintained with raw `increment` updates inside the calling transaction so
 * registrations/attendance can keep them consistent without an extra select.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  EventCategoryValue,
  EventRegistrationTypeValue,
  EventStatusValue,
  EventTypeValue,
} from '../events.constants';
import type { EventRow } from '../events.types';

export interface CreateEventInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly eventType: EventTypeValue;
  readonly category: EventCategoryValue;
  readonly subType?: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly startTime?: Date | null;
  readonly endTime?: Date | null;
  readonly timezone?: string;
  readonly branchId?: string | null;
  readonly venue?: string | null;
  readonly organizerStaffId?: string | null;
  readonly registrationType?: EventRegistrationTypeValue;
  readonly registrationCapacity?: number | null;
  readonly isFree?: boolean;
  readonly feeHeadId?: string | null;
  readonly feeStructureId?: string | null;
  readonly feeAmount?: number | null;
  readonly estimatedCost?: number | null;
  readonly actualCost?: number | null;
  readonly sponsorshipAmount?: number | null;
}

export interface UpdateEventInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly eventType?: EventTypeValue;
  readonly category?: EventCategoryValue;
  readonly subType?: string | null;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly startTime?: Date | null;
  readonly endTime?: Date | null;
  readonly venue?: string | null;
  readonly branchId?: string | null;
  readonly organizerStaffId?: string | null;
  readonly registrationType?: EventRegistrationTypeValue;
  readonly registrationCapacity?: number | null;
  readonly isFree?: boolean;
  readonly feeHeadId?: string | null;
  readonly feeStructureId?: string | null;
  readonly feeAmount?: number | null;
  readonly estimatedCost?: number | null;
  readonly actualCost?: number | null;
  readonly sponsorshipAmount?: number | null;
}

export interface ListEventArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly status?: EventStatusValue;
  readonly eventType?: EventTypeValue;
  readonly category?: EventCategoryValue;
  readonly branchId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<EventRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.event.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findActiveByCode(
    code: string,
    tx?: PrismaTx,
  ): Promise<EventRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.event.findFirst({
      where: { schoolId, code, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(
    args: ListEventArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly EventRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (args.status !== undefined) where.status = args.status;
    if (args.eventType !== undefined) where.eventType = args.eventType;
    if (args.category !== undefined) where.category = args.category;
    if (args.branchId !== undefined) where.branchId = args.branchId;
    if (args.from !== undefined || args.to !== undefined) {
      const range: Record<string, Date> = {};
      if (args.from !== undefined) range.gte = args.from;
      if (args.to !== undefined) range.lte = args.to;
      where.startDate = range;
    }
    const rows = await reader.event.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(input: CreateEventInput, tx?: PrismaTx): Promise<EventRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.event.create({
      data: {
        schoolId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        eventType: input.eventType,
        category: input.category,
        subType: input.subType ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        branchId: input.branchId ?? null,
        venue: input.venue ?? null,
        organizerStaffId: input.organizerStaffId ?? null,
        ...(input.registrationType !== undefined
          ? { registrationType: input.registrationType }
          : {}),
        registrationCapacity: input.registrationCapacity ?? null,
        ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
        feeHeadId: input.feeHeadId ?? null,
        feeStructureId: input.feeStructureId ?? null,
        feeAmount: input.feeAmount ?? null,
        estimatedCost: input.estimatedCost ?? null,
        actualCost: input.actualCost ?? null,
        sponsorshipAmount: input.sponsorshipAmount ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateEventInput,
    tx?: PrismaTx,
  ): Promise<EventRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.eventType !== undefined) data.eventType = input.eventType;
    if (input.category !== undefined) data.category = input.category;
    if (input.subType !== undefined) data.subType = input.subType;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime;
    if (input.venue !== undefined) data.venue = input.venue;
    if (input.branchId !== undefined) data.branchId = input.branchId;
    if (input.organizerStaffId !== undefined) {
      data.organizerStaffId = input.organizerStaffId;
    }
    if (input.registrationType !== undefined) {
      data.registrationType = input.registrationType;
    }
    if (input.registrationCapacity !== undefined) {
      data.registrationCapacity = input.registrationCapacity;
    }
    if (input.isFree !== undefined) data.isFree = input.isFree;
    if (input.feeHeadId !== undefined) data.feeHeadId = input.feeHeadId;
    if (input.feeStructureId !== undefined) {
      data.feeStructureId = input.feeStructureId;
    }
    if (input.feeAmount !== undefined) data.feeAmount = input.feeAmount;
    if (input.estimatedCost !== undefined) data.estimatedCost = input.estimatedCost;
    if (input.actualCost !== undefined) data.actualCost = input.actualCost;
    if (input.sponsorshipAmount !== undefined) {
      data.sponsorshipAmount = input.sponsorshipAmount;
    }
    const result = await writer.event.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Event', id, expectedVersion);
    }
    const reloaded = await writer.event.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Event', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async patchStatus(
    id: string,
    expectedVersion: number,
    patch: {
      readonly status: EventStatusValue;
      readonly publishedAt?: Date;
      readonly startedAt?: Date;
      readonly completedAt?: Date;
      readonly cancelledAt?: Date;
      readonly cancellationReason?: string | null;
      readonly registrationOpen?: boolean;
      readonly registrationOpenAt?: Date | null;
      readonly registrationClosedAt?: Date | null;
    },
    tx?: PrismaTx,
  ): Promise<EventRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status: patch.status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.publishedAt !== undefined) data.publishedAt = patch.publishedAt;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.completedAt !== undefined) data.completedAt = patch.completedAt;
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;
    if (patch.cancellationReason !== undefined) {
      data.cancellationReason = patch.cancellationReason;
    }
    if (patch.registrationOpen !== undefined) {
      data.registrationOpen = patch.registrationOpen;
    }
    if (patch.registrationOpenAt !== undefined) {
      data.registrationOpenAt = patch.registrationOpenAt;
    }
    if (patch.registrationClosedAt !== undefined) {
      data.registrationClosedAt = patch.registrationClosedAt;
    }
    const result = await writer.event.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('Event', id, expectedVersion);
    }
    const reloaded = await writer.event.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('Event', id, expectedVersion);
    }
    return mapRow(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.event.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('Event', id, expectedVersion);
    }
  }

  /**
   * Atomically increment counters. Used by participant + attendance services.
   * Returns the count of rows updated (1 = success).
   */
  public async bumpCounters(
    id: string,
    delta: {
      readonly registered?: number;
      readonly attended?: number;
      readonly absent?: number;
    },
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const { schoolId } = this.tenant();
    const data: Record<string, unknown> = {};
    if (delta.registered !== undefined && delta.registered !== 0) {
      data.registeredCount = { increment: delta.registered };
    }
    if (delta.attended !== undefined && delta.attended !== 0) {
      data.attendedCount = { increment: delta.attended };
    }
    if (delta.absent !== undefined && delta.absent !== 0) {
      data.absentCount = { increment: delta.absent };
    }
    if (Object.keys(data).length === 0) return 0;
    const result = await writer.event.updateMany({
      where: { schoolId, id, deletedAt: null },
      data,
    });
    return result.count;
  }
}

interface RawEvent {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  description: string | null;
  eventType: string;
  category: string;
  subType: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
  startTime: Date | null;
  endTime: Date | null;
  timezone: string;
  branchId: string | null;
  venue: string | null;
  organizerStaffId: string | null;
  registrationType: string;
  registrationOpen: boolean;
  registrationOpenAt: Date | null;
  registrationClosedAt: Date | null;
  registrationCapacity: number | null;
  isFree: boolean;
  feeHeadId: string | null;
  feeStructureId: string | null;
  feeAmount: unknown | null;
  estimatedCost: unknown | null;
  actualCost: unknown | null;
  sponsorshipAmount: unknown | null;
  publishedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  registeredCount: number;
  attendedCount: number;
  absentCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapRow(row: RawEvent): EventRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    eventType: row.eventType as EventRow['eventType'],
    category: row.category as EventRow['category'],
    subType: row.subType,
    status: row.status as EventRow['status'],
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    branchId: row.branchId,
    venue: row.venue,
    organizerStaffId: row.organizerStaffId,
    registrationType: row.registrationType as EventRow['registrationType'],
    registrationOpen: row.registrationOpen,
    registrationOpenAt: row.registrationOpenAt,
    registrationClosedAt: row.registrationClosedAt,
    registrationCapacity: row.registrationCapacity,
    isFree: row.isFree,
    feeHeadId: row.feeHeadId,
    feeStructureId: row.feeStructureId,
    feeAmount: toNumber(row.feeAmount),
    estimatedCost: toNumber(row.estimatedCost),
    actualCost: toNumber(row.actualCost),
    sponsorshipAmount: toNumber(row.sponsorshipAmount),
    publishedAt: row.publishedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    registeredCount: row.registeredCount,
    attendedCount: row.attendedCount,
    absentCount: row.absentCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

export const __test__ = { toNumber };
