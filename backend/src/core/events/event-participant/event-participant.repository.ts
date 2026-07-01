/**
 * EventParticipantRepository — persistence for `event_participants` rows.
 *
 * Soft-delete + active-uniqueness via STORED `deleted_at_key` partial unique
 * on `(schoolId, eventId, userId)`. Repo pre-checks for duplicates to surface
 * a friendlier error.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  EventParticipantAudienceValue,
  EventParticipantStatusValue,
  EventRegistrationTypeValue,
} from '../events.constants';
import type { EventParticipantRow } from '../events.types';

export interface CreateEventParticipantInput {
  readonly eventId: string;
  readonly audience: EventParticipantAudienceValue;
  readonly userId: string;
  readonly studentId?: string | null;
  readonly staffId?: string | null;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly status: EventParticipantStatusValue;
  readonly registrationType: EventRegistrationTypeValue;
  readonly registrationSource: string;
}

export interface ListEventParticipantArgs {
  readonly eventId: string;
  readonly limit: number;
  readonly cursorId?: string;
  readonly audience?: EventParticipantAudienceValue;
  readonly status?: EventParticipantStatusValue;
}

@Injectable()
export class EventParticipantRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventParticipantRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(
    id: string,
    tx?: PrismaTx,
  ): Promise<EventParticipantRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventParticipant.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async findActiveByEventUser(
    eventId: string,
    userId: string,
    tx?: PrismaTx,
  ): Promise<EventParticipantRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.eventParticipant.findFirst({
      where: { schoolId, eventId, userId, deletedAt: null },
    });
    return row === null ? null : mapRow(row);
  }

  public async list(args: ListEventParticipantArgs, tx?: PrismaTx): Promise<{
    readonly rows: readonly EventParticipantRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      eventId: args.eventId,
      deletedAt: null,
    };
    if (args.audience !== undefined) where.audience = args.audience;
    if (args.status !== undefined) where.status = args.status;
    const rows = await reader.eventParticipant.findMany({
      where,
      orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return { rows: rows.map(mapRow), nextCursorId };
  }

  public async create(
    input: CreateEventParticipantInput,
    tx?: PrismaTx,
  ): Promise<EventParticipantRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const created = await writer.eventParticipant.create({
      data: {
        schoolId,
        eventId: input.eventId,
        audience: input.audience,
        userId: input.userId,
        studentId: input.studentId ?? null,
        staffId: input.staffId ?? null,
        classId: input.classId ?? null,
        sectionId: input.sectionId ?? null,
        status: input.status,
        registrationType: input.registrationType,
        registrationSource: input.registrationSource,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapRow(created);
  }

  public async patchStatus(
    id: string,
    expectedVersion: number,
    patch: {
      readonly status: EventParticipantStatusValue;
      readonly approvedAt?: Date;
      readonly approvedBy?: string | null;
      readonly rejectedAt?: Date;
      readonly rejectedBy?: string | null;
      readonly rejectionReason?: string | null;
      readonly cancelledAt?: Date;
      readonly cancellationReason?: string | null;
    },
    tx?: PrismaTx,
  ): Promise<EventParticipantRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      status: patch.status,
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt;
    if (patch.approvedBy !== undefined) data.approvedBy = patch.approvedBy;
    if (patch.rejectedAt !== undefined) data.rejectedAt = patch.rejectedAt;
    if (patch.rejectedBy !== undefined) data.rejectedBy = patch.rejectedBy;
    if (patch.rejectionReason !== undefined) {
      data.rejectionReason = patch.rejectionReason;
    }
    if (patch.cancelledAt !== undefined) data.cancelledAt = patch.cancelledAt;
    if (patch.cancellationReason !== undefined) {
      data.cancellationReason = patch.cancellationReason;
    }
    const result = await writer.eventParticipant.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventParticipant', id, expectedVersion);
    }
    const reloaded = await writer.eventParticipant.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('EventParticipant', id, expectedVersion);
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
    const result = await writer.eventParticipant.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('EventParticipant', id, expectedVersion);
    }
  }

  /**
   * Bulk-cancel every non-terminal participant for an event. Used by the
   * event-cancel cascade. Returns the count of rows flipped.
   */
  public async cancelAllForEvent(
    eventId: string,
    reason: string | null,
    tx?: PrismaTx,
  ): Promise<number> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.eventParticipant.updateMany({
      where: {
        schoolId,
        eventId,
        deletedAt: null,
        status: { in: ['PENDING', 'REGISTERED', 'INVITED'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    return result.count;
  }

  public async countActiveRegisteredForEvent(
    eventId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    return reader.eventParticipant.count({
      where: {
        schoolId,
        eventId,
        deletedAt: null,
        status: { in: ['PENDING', 'REGISTERED', 'INVITED'] },
      },
    });
  }
}

interface RawEventParticipant {
  id: string;
  schoolId: string;
  eventId: string;
  audience: string;
  userId: string;
  studentId: string | null;
  staffId: string | null;
  classId: string | null;
  sectionId: string | null;
  status: string;
  registrationType: string;
  registeredAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  registrationSource: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function mapRow(row: RawEventParticipant): EventParticipantRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    eventId: row.eventId,
    audience: row.audience as EventParticipantRow['audience'],
    userId: row.userId,
    studentId: row.studentId,
    staffId: row.staffId,
    classId: row.classId,
    sectionId: row.sectionId,
    status: row.status as EventParticipantRow['status'],
    registrationType: row.registrationType as EventParticipantRow['registrationType'],
    registeredAt: row.registeredAt,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    rejectedAt: row.rejectedAt,
    rejectedBy: row.rejectedBy,
    rejectionReason: row.rejectionReason,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    registrationSource: row.registrationSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}
