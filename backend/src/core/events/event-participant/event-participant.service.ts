/**
 * EventParticipantService — orchestrates individual + bulk participant
 * registration, approval, rejection, and cancellation.
 *
 * Gates:
 *   1. `module.events`.
 *   2. Event exists + status not in TERMINAL set + registrationOpen.
 *   3. For INVITATION_ONLY events, only `invite` paths may add participants
 *      (Sprint 11 only ships the public `register` path; INVITATION_ONLY
 *      events currently refuse public registration with EventInvitationOnlyError).
 *   4. Capacity check (if `registrationCapacity != null`).
 *   5. Duplicate (eventId + userId) guard (partial unique).
 *   6. For paid events (isFree=false) + audience=STUDENT, an
 *      `EventFeeAssignment(PENDING)` row is auto-created in the same tx.
 *
 * Counter maintenance: every successful registration increments
 * `event.registeredCount` (atomic increment). Cancel decrements.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { EventRepository } from '../event/event.repository';
import { EventFeeAssignmentRepository } from '../event-fee-assignment/event-fee-assignment.repository';
import {
  BULK_REGISTRATION_MAX_STUDENTS,
  EventsFeatureFlags,
  EventsOutboxTopics,
  REGISTRATION_SOURCE_BULK_CLASS,
  REGISTRATION_SOURCE_BULK_SECTION,
  REGISTRATION_SOURCE_INDIVIDUAL,
  type EventParticipantAudienceValue,
} from '../events.constants';
import {
  DuplicateEventParticipantError,
  EventBulkRegistrationDisabledError,
  EventCapacityExceededError,
  EventFeeHeadMissingError,
  EventInvitationOnlyError,
  EventNotFoundError,
  EventParticipantNotApprovableError,
  EventParticipantNotFoundError,
  EventRegistrationClosedError,
  EventsModuleDisabledError,
} from '../events.errors';
import type { EventParticipantRow } from '../events.types';
import {
  EventParticipantRepository,
  type CreateEventParticipantInput,
  type ListEventParticipantArgs,
} from './event-participant.repository';

export interface RegisterParticipantArgs {
  readonly eventId: string;
  readonly audience: EventParticipantAudienceValue;
  readonly userId: string;
  readonly studentId?: string | null;
  readonly staffId?: string | null;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
}

@Injectable()
export class EventParticipantService {
  private readonly logger = new Logger(EventParticipantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventParticipantRepository,
    private readonly eventRepo: EventRepository,
    private readonly feeAssignmentRepo: EventFeeAssignmentRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListEventParticipantArgs): Promise<{
    readonly items: readonly EventParticipantRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async register(args: RegisterParticipantArgs): Promise<EventParticipantRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      return this.registerInTx(args, REGISTRATION_SOURCE_INDIVIDUAL, tx);
    });
  }

  public async bulkRegisterClass(
    eventId: string,
    classId: string,
    audience: EventParticipantAudienceValue,
  ): Promise<{ registered: number; skipped: number }> {
    await this.assertModuleEnabled();
    await this.assertBulkAllowed();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const students = await tx.student.findMany({
        where: {
          schoolId,
          classId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        take: BULK_REGISTRATION_MAX_STUDENTS,
        select: { id: true, sectionId: true },
      });
      return this.bulkRegisterStudents(
        eventId,
        students.map((s) => ({
          id: s.id,
          userId: s.id,
          currentClassId: classId,
          currentSectionId: s.sectionId,
        })),
        audience,
        classId,
        null,
        REGISTRATION_SOURCE_BULK_CLASS,
        tx,
      );
    });
  }

  public async bulkRegisterSection(
    eventId: string,
    sectionId: string,
    audience: EventParticipantAudienceValue,
  ): Promise<{ registered: number; skipped: number }> {
    await this.assertModuleEnabled();
    await this.assertBulkAllowed();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();
      const students = await tx.student.findMany({
        where: {
          schoolId,
          sectionId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        take: BULK_REGISTRATION_MAX_STUDENTS,
        select: { id: true, classId: true },
      });
      return this.bulkRegisterStudents(
        eventId,
        students.map((s) => ({
          id: s.id,
          userId: s.id,
          currentSectionId: sectionId,
          currentClassId: s.classId,
        })),
        audience,
        null,
        sectionId,
        REGISTRATION_SOURCE_BULK_SECTION,
        tx,
      );
    });
  }

  public async approve(
    eventId: string,
    participantId: string,
    expectedVersion: number,
  ): Promise<EventParticipantRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const ctx = RequestContextRegistry.require();
      const current = await this.repo.findById(participantId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventParticipantNotFoundError(participantId);
      }
      if (current.status !== 'PENDING') {
        throw new EventParticipantNotApprovableError(participantId, current.status);
      }
      const updated = await this.repo.patchStatus(
        participantId,
        expectedVersion,
        {
          status: 'REGISTERED',
          approvedAt: new Date(),
          approvedBy: ctx.userId ?? null,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.PARTICIPANT_APPROVED,
        eventType: 'EventParticipantApproved',
        aggregateType: 'EventParticipant',
        aggregateId: participantId,
        payload: { id: participantId, eventId, userId: current.userId },
      });
      await this.audit.record(
        {
          action: 'event-participant.approve',
          category: 'general',
          resourceType: 'EventParticipant',
          resourceId: participantId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async reject(
    eventId: string,
    participantId: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<EventParticipantRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const ctx = RequestContextRegistry.require();
      const current = await this.repo.findById(participantId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventParticipantNotFoundError(participantId);
      }
      if (current.status !== 'PENDING') {
        throw new EventParticipantNotApprovableError(participantId, current.status);
      }
      const updated = await this.repo.patchStatus(
        participantId,
        expectedVersion,
        {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: ctx.userId ?? null,
          rejectionReason: reason,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.PARTICIPANT_REJECTED,
        eventType: 'EventParticipantRejected',
        aggregateType: 'EventParticipant',
        aggregateId: participantId,
        payload: { id: participantId, eventId, reason },
      });
      await this.audit.record(
        {
          action: 'event-participant.reject',
          category: 'general',
          resourceType: 'EventParticipant',
          resourceId: participantId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async cancel(
    eventId: string,
    participantId: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(participantId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventParticipantNotFoundError(participantId);
      }

      await this.repo.patchStatus(
        participantId,
        expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        tx,
      );

      const updated = await this.repo.findById(participantId, tx);
      if (updated !== null) {
        await this.repo.softDelete(participantId, updated.version, tx);
      }

      if (current.status === 'REGISTERED' || current.status === 'INVITED') {
        await this.eventRepo.bumpCounters(eventId, { registered: -1 }, tx);
      }

      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.PARTICIPANT_CANCELLED,
        eventType: 'EventParticipantCancelled',
        aggregateType: 'EventParticipant',
        aggregateId: participantId,
        payload: { id: participantId, eventId, reason },
      });

      await this.audit.record(
        {
          action: 'event-participant.cancel',
          category: 'general',
          resourceType: 'EventParticipant',
          resourceId: participantId,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------
  private async registerInTx(
    args: RegisterParticipantArgs,
    source: string,
    tx: PrismaTx,
  ): Promise<EventParticipantRow> {
    const event = await this.eventRepo.findById(args.eventId, tx);
    if (event === null) throw new EventNotFoundError(args.eventId);

    if (!event.registrationOpen) {
      throw new EventRegistrationClosedError(args.eventId);
    }
    if (
      event.status === 'COMPLETED' ||
      event.status === 'CANCELLED'
    ) {
      throw new EventRegistrationClosedError(args.eventId);
    }
    if (event.registrationType === 'INVITATION_ONLY' && source === REGISTRATION_SOURCE_INDIVIDUAL) {
      throw new EventInvitationOnlyError(args.eventId);
    }

    if (
      event.registrationCapacity !== null &&
      event.registeredCount >= event.registrationCapacity
    ) {
      throw new EventCapacityExceededError(
        args.eventId,
        event.registrationCapacity,
        event.registeredCount,
      );
    }

    const existing = await this.repo.findActiveByEventUser(args.eventId, args.userId, tx);
    if (existing !== null) {
      throw new DuplicateEventParticipantError(args.eventId, args.userId);
    }

    const status: CreateEventParticipantInput['status'] =
      event.registrationType === 'APPROVAL_REQUIRED' ? 'PENDING' : 'REGISTERED';

    const created = await this.repo.create(
      {
        eventId: args.eventId,
        audience: args.audience,
        userId: args.userId,
        studentId: args.studentId ?? null,
        staffId: args.staffId ?? null,
        classId: args.classId ?? null,
        sectionId: args.sectionId ?? null,
        status,
        registrationType: event.registrationType,
        registrationSource: source,
      },
      tx,
    );

    if (status === 'REGISTERED') {
      await this.eventRepo.bumpCounters(args.eventId, { registered: 1 }, tx);
    }

    if (event.isFree === false && args.audience === 'STUDENT') {
      if (event.feeHeadId === null) {
        throw new EventFeeHeadMissingError(args.eventId);
      }
      if (args.studentId === null || args.studentId === undefined) {
        throw new EventFeeHeadMissingError(args.eventId);
      }
      await this.feeAssignmentRepo.create(
        {
          eventId: args.eventId,
          participantId: created.id,
          studentId: args.studentId,
          feeHeadId: event.feeHeadId,
          feeStructureId: event.feeStructureId ?? null,
          amount: event.feeAmount ?? 0,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.FEE_ASSIGNMENT_CREATED,
        eventType: 'EventFeeAssignmentCreated',
        aggregateType: 'EventFeeAssignment',
        aggregateId: created.id,
        payload: {
          eventId: args.eventId,
          participantId: created.id,
          studentId: args.studentId,
        },
      });
    }

    await this.outbox.publish(tx, {
      topic: EventsOutboxTopics.PARTICIPANT_REGISTERED,
      eventType: 'EventParticipantRegistered',
      aggregateType: 'EventParticipant',
      aggregateId: created.id,
      payload: {
        id: created.id,
        eventId: args.eventId,
        userId: args.userId,
        audience: args.audience,
        status,
      },
    });

    await this.audit.record(
      {
        action: 'event-participant.create',
        category: 'general',
        resourceType: 'EventParticipant',
        resourceId: created.id,
        after: created,
      },
      { tx: tx as unknown as AuditTxLike },
    );

    return created;
  }

  private async bulkRegisterStudents(
    eventId: string,
    students: ReadonlyArray<{
      id: string;
      userId: string;
      currentClassId?: string | null;
      currentSectionId?: string | null;
    }>,
    audience: EventParticipantAudienceValue,
    classId: string | null,
    sectionId: string | null,
    source: string,
    tx: PrismaTx,
  ): Promise<{ registered: number; skipped: number }> {
    let registered = 0;
    let skipped = 0;
    for (const student of students) {
      try {
        await this.registerInTx(
          {
            eventId,
            audience,
            userId: student.userId,
            studentId: student.id,
            classId: classId ?? student.currentClassId ?? null,
            sectionId: sectionId ?? student.currentSectionId ?? null,
          },
          source,
          tx,
        );
        registered += 1;
      } catch (err) {
        if (
          err instanceof DuplicateEventParticipantError ||
          err instanceof EventCapacityExceededError
        ) {
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
    this.logger.log(
      `Bulk registration for event=${eventId} (${source}): registered=${registered} skipped=${skipped}.`,
    );
    return { registered, skipped };
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventParticipantService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(EventsFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new EventsModuleDisabledError();
  }

  private async assertBulkAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      EventsFeatureFlags.ALLOW_BULK_REGISTRATION,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new EventBulkRegistrationDisabledError();
  }
}
