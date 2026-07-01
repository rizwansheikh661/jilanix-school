/**
 * EventService — orchestration for Event header + lifecycle.
 *
 * Validation gates:
 *   1. `module.events` feature flag.
 *   2. Date range validity (`endDate >= startDate`).
 *   3. Duplicate-code guard (active rows only).
 *   4. Cross-tenant FK guard via private `assertTenantRefs`.
 *   5. Paid-event sanity (`isFree=false` ⇒ `feeHeadId` required).
 *   6. State-machine `assertTransition` on every lifecycle endpoint.
 *   7. Field-editability whitelist on PATCH after DRAFT.
 *   8. Delete refused if status is PUBLISHED/ONGOING (cancel first).
 *
 * Every mutation publishes a `event.*` outbox event + writes a general-
 * category audit row inside the same tx. Notification dispatch is invoked
 * AFTER the business tx commits (dispatcher opens its own tx). Sequence
 * allocation (`SEQ_NAMES.EVENT`) shares the business tx so a rolled-back
 * create does NOT burn a number.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SEQ_NAMES, SequenceService } from '../../sequences';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import { EventFeeAssignmentRepository } from '../event-fee-assignment/event-fee-assignment.repository';
import { EventParticipantRepository } from '../event-participant/event-participant.repository';
import {
  EventsFeatureFlags,
  EventsNotificationEventKeys,
  EventsOutboxTopics,
  type EventCategoryValue,
  type EventRegistrationTypeValue,
  type EventStatusValue,
  type EventTypeValue,
} from '../events.constants';
import {
  EventDateRangeInvalidError,
  EventFeeHeadMissingError,
  EventInvalidStateTransitionError,
  EventNotEditableError,
  EventNotFoundError,
  EventsModuleDisabledError,
  DuplicateEventCodeError,
} from '../events.errors';
import type { EventRow } from '../events.types';
import {
  assertFieldEditable,
  assertTransition,
  TERMINAL_EVENT_STATUSES,
} from './event-state-machine';
import {
  EventRepository,
  type CreateEventInput,
  type ListEventArgs,
  type UpdateEventInput,
} from './event.repository';

export interface CreateEventArgs extends Omit<CreateEventInput, 'code'> {
  readonly code?: string;
}

export type UpdateEventArgs = UpdateEventInput;

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventRepository,
    private readonly participantRepo: EventParticipantRepository,
    private readonly feeAssignmentRepo: EventFeeAssignmentRepository,
    private readonly sequences: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly dispatcher: NotificationEventDispatcherService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  public async list(args: ListEventArgs): Promise<{
    readonly items: readonly EventRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<EventRow> {
    await this.assertModuleEnabled();
    const row = await this.repo.findById(id);
    if (row === null) throw new EventNotFoundError(id);
    return row;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  public async create(args: CreateEventArgs): Promise<EventRow> {
    await this.assertModuleEnabled();
    this.assertDateRange(args.startDate, args.endDate);
    if (args.isFree === false && (args.feeHeadId === null || args.feeHeadId === undefined)) {
      throw new EventFeeHeadMissingError('<new>');
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      await this.assertTenantRefs(tx, schoolId, {
        branchIds: args.branchId ? [args.branchId] : [],
        staffIds: args.organizerStaffId ? [args.organizerStaffId] : [],
        feeHeadIds: args.feeHeadId ? [args.feeHeadId] : [],
        feeStructureIds: args.feeStructureId ? [args.feeStructureId] : [],
      });

      const code = args.code ?? (await this.allocateCode(tx));
      const dup = await this.repo.findActiveByCode(code, tx);
      if (dup !== null) throw new DuplicateEventCodeError(code);

      const created = await this.repo.create({ ...args, code }, tx);

      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_CREATED,
        eventType: 'EventCreated',
        aggregateType: 'Event',
        aggregateId: created.id,
        payload: { id: created.id, code: created.code, name: created.name },
      });

      await this.audit.record(
        {
          action: 'event.create',
          category: 'general',
          resourceType: 'Event',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Event created id=${created.id} code="${created.code}".`);
      return created;
    });
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  public async update(
    id: string,
    expectedVersion: number,
    args: UpdateEventArgs,
  ): Promise<EventRow> {
    await this.assertModuleEnabled();

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const schoolId = this.requireSchoolId();

      const current = await this.repo.findById(id, tx);
      if (current === null) throw new EventNotFoundError(id);

      for (const key of Object.keys(args)) {
        const value = (args as Record<string, unknown>)[key];
        if (value === undefined) continue;
        assertFieldEditable(id, current.status, key);
      }

      const startDate = args.startDate ?? current.startDate;
      const endDate = args.endDate ?? current.endDate;
      this.assertDateRange(startDate, endDate);

      if (args.isFree === false || (args.isFree === undefined && current.isFree === false)) {
        const newHeadId = args.feeHeadId ?? current.feeHeadId;
        if (newHeadId === null || newHeadId === undefined) {
          throw new EventFeeHeadMissingError(id);
        }
      }

      await this.assertTenantRefs(tx, schoolId, {
        branchIds: args.branchId ? [args.branchId] : [],
        staffIds: args.organizerStaffId ? [args.organizerStaffId] : [],
        feeHeadIds: args.feeHeadId ? [args.feeHeadId] : [],
        feeStructureIds: args.feeStructureId ? [args.feeStructureId] : [],
      });

      const updated = await this.repo.update(id, expectedVersion, args, tx);

      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_UPDATED,
        eventType: 'EventUpdated',
        aggregateType: 'Event',
        aggregateId: id,
        payload: { id, code: updated.code, name: updated.name },
      });

      await this.audit.record(
        {
          action: 'event.update',
          category: 'general',
          resourceType: 'Event',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle: schedule
  // -------------------------------------------------------------------------
  public async schedule(id: string, expectedVersion: number): Promise<EventRow> {
    return this.transitionStatus({
      id,
      expectedVersion,
      to: 'SCHEDULED',
      topic: EventsOutboxTopics.EVENT_SCHEDULED,
      action: 'event.schedule',
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle: publish (dispatches EVENT_PUBLISHED notification)
  // -------------------------------------------------------------------------
  public async publish(id: string, expectedVersion: number): Promise<EventRow> {
    const result = await this.transitionStatus({
      id,
      expectedVersion,
      to: 'PUBLISHED',
      topic: EventsOutboxTopics.EVENT_PUBLISHED,
      action: 'event.publish',
      patchExtra: { publishedAt: new Date() },
    });
    await this.dispatchLifecycleNotification(result, 'EVENT_PUBLISHED');
    return result;
  }

  // -------------------------------------------------------------------------
  // Lifecycle: start
  // -------------------------------------------------------------------------
  public async start(id: string, expectedVersion: number): Promise<EventRow> {
    return this.transitionStatus({
      id,
      expectedVersion,
      to: 'ONGOING',
      topic: EventsOutboxTopics.EVENT_STARTED,
      action: 'event.start',
      patchExtra: { startedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle: complete
  // -------------------------------------------------------------------------
  public async complete(id: string, expectedVersion: number): Promise<EventRow> {
    return this.transitionStatus({
      id,
      expectedVersion,
      to: 'COMPLETED',
      topic: EventsOutboxTopics.EVENT_COMPLETED,
      action: 'event.complete',
      patchExtra: { completedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle: cancel (cascades to participants + open fee assignments;
  // dispatches EVENT_CANCELLED notification)
  // -------------------------------------------------------------------------
  public async cancel(
    id: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<EventRow> {
    await this.assertModuleEnabled();

    const result = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new EventNotFoundError(id);
      if (TERMINAL_EVENT_STATUSES.has(current.status)) {
        throw new EventInvalidStateTransitionError(id, current.status, 'CANCELLED');
      }
      assertTransition(id, current.status, 'CANCELLED');

      const now = new Date();
      const updated = await this.repo.patchStatus(
        id,
        expectedVersion,
        {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: reason,
          registrationOpen: false,
          registrationClosedAt: now,
        },
        tx,
      );

      const cancelledParticipants = await this.participantRepo.cancelAllForEvent(
        id,
        reason,
        tx,
      );
      const voidedAssignments = await this.feeAssignmentRepo.voidAllPendingForEvent(
        id,
        reason,
        tx,
      );

      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_CANCELLED,
        eventType: 'EventCancelled',
        aggregateType: 'Event',
        aggregateId: id,
        payload: {
          id,
          code: updated.code,
          cancelledParticipants,
          voidedAssignments,
          reason,
        },
      });

      await this.audit.record(
        {
          action: 'event.cancel',
          category: 'general',
          resourceType: 'Event',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `Event cancelled id=${id} cascadedParticipants=${cancelledParticipants} voidedAssignments=${voidedAssignments}.`,
      );
      return updated;
    });

    await this.dispatchLifecycleNotification(result, 'EVENT_CANCELLED', { reason });
    return result;
  }

  // -------------------------------------------------------------------------
  // Registration open / close
  // -------------------------------------------------------------------------
  public async openRegistration(
    id: string,
    expectedVersion: number,
  ): Promise<EventRow> {
    await this.assertModuleEnabled();

    const result = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new EventNotFoundError(id);
      if (TERMINAL_EVENT_STATUSES.has(current.status)) {
        throw new EventNotEditableError(id, current.status, 'registrationOpen');
      }
      const now = new Date();
      const updated = await this.repo.patchStatus(
        id,
        expectedVersion,
        {
          status: current.status,
          registrationOpen: true,
          registrationOpenAt: now,
          registrationClosedAt: null,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_REGISTRATION_OPENED,
        eventType: 'EventRegistrationOpened',
        aggregateType: 'Event',
        aggregateId: id,
        payload: { id, code: updated.code },
      });
      await this.audit.record(
        {
          action: 'event.open-registration',
          category: 'general',
          resourceType: 'Event',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });

    await this.dispatchLifecycleNotification(result, 'EVENT_REGISTRATION_OPENED');
    return result;
  }

  public async closeRegistration(
    id: string,
    expectedVersion: number,
  ): Promise<EventRow> {
    await this.assertModuleEnabled();

    const result = await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new EventNotFoundError(id);
      const now = new Date();
      const updated = await this.repo.patchStatus(
        id,
        expectedVersion,
        {
          status: current.status,
          registrationOpen: false,
          registrationClosedAt: now,
        },
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_REGISTRATION_CLOSED,
        eventType: 'EventRegistrationClosed',
        aggregateType: 'Event',
        aggregateId: id,
        payload: { id, code: updated.code },
      });
      await this.audit.record(
        {
          action: 'event.close-registration',
          category: 'general',
          resourceType: 'Event',
          resourceId: id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });

    await this.dispatchLifecycleNotification(result, 'EVENT_REGISTRATION_CLOSED');
    return result;
  }

  // -------------------------------------------------------------------------
  // Soft-delete (refused if PUBLISHED/ONGOING — must cancel first)
  // -------------------------------------------------------------------------
  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new EventNotFoundError(id);

      if (current.status === 'PUBLISHED' || current.status === 'ONGOING') {
        throw new EventNotEditableError(id, current.status, '<delete>');
      }

      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.EVENT_DELETED,
        eventType: 'EventDeleted',
        aggregateType: 'Event',
        aggregateId: id,
        payload: { id, code: current.code },
      });

      await this.audit.record(
        {
          action: 'event.delete',
          category: 'general',
          resourceType: 'Event',
          resourceId: id,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Shared transition helper
  // -------------------------------------------------------------------------
  private async transitionStatus(opts: {
    readonly id: string;
    readonly expectedVersion: number;
    readonly to: EventStatusValue;
    readonly topic: string;
    readonly action: string;
    readonly patchExtra?: Record<string, unknown>;
  }): Promise<EventRow> {
    await this.assertModuleEnabled();
    if (opts.to === 'PUBLISHED') {
      await this.assertPublishAllowed();
    }

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(opts.id, tx);
      if (current === null) throw new EventNotFoundError(opts.id);
      assertTransition(opts.id, current.status, opts.to);

      const updated = await this.repo.patchStatus(
        opts.id,
        opts.expectedVersion,
        { status: opts.to, ...(opts.patchExtra ?? {}) },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: opts.topic,
        eventType: this.outboxEventType(opts.to),
        aggregateType: 'Event',
        aggregateId: opts.id,
        payload: { id: opts.id, code: updated.code, status: updated.status },
      });

      await this.audit.record(
        {
          action: opts.action,
          category: 'general',
          resourceType: 'Event',
          resourceId: opts.id,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`Event ${opts.id} transitioned ${current.status} → ${opts.to}.`);
      return updated;
    });
  }

  private outboxEventType(to: EventStatusValue): string {
    switch (to) {
      case 'SCHEDULED':
        return 'EventScheduled';
      case 'PUBLISHED':
        return 'EventPublished';
      case 'ONGOING':
        return 'EventStarted';
      case 'COMPLETED':
        return 'EventCompleted';
      case 'CANCELLED':
        return 'EventCancelled';
      default:
        return 'EventUpdated';
    }
  }

  // -------------------------------------------------------------------------
  // Notification dispatch — invoked AFTER the business tx commits.
  // -------------------------------------------------------------------------
  private async dispatchLifecycleNotification(
    event: EventRow,
    key: keyof typeof EventsNotificationEventKeys,
    extraVars: Record<string, unknown> = {},
  ): Promise<void> {
    const enabled = await this.featureFlags.isEnabled(
      EventsFeatureFlags.NOTIFY_ON_LIFECYCLE,
      { schoolId: event.schoolId },
    );
    if (!enabled) return;

    const recipientIds = new Set<string>();
    if (event.organizerStaffId !== null) recipientIds.add(event.organizerStaffId);
    if (event.createdBy !== null && event.createdBy !== undefined) {
      recipientIds.add(event.createdBy);
    }
    if (recipientIds.size === 0) {
      this.logger.debug(
        `Skipping lifecycle notification ${key} for event=${event.id}: no recipients resolved.`,
      );
      return;
    }

    try {
      await this.dispatcher.dispatch({
        eventKey: EventsNotificationEventKeys[key],
        schoolId: event.schoolId,
        recipients: Array.from(recipientIds).map((userId) => ({ userId })),
        variables: {
          eventId: event.id,
          eventCode: event.code,
          eventName: event.name,
          startDate: event.startDate.toISOString().slice(0, 10),
          endDate: event.endDate.toISOString().slice(0, 10),
          venue: event.venue,
          ...extraVars,
        },
        aggregateType: 'Event',
        aggregateId: event.id,
      });
    } catch (err) {
      this.logger.warn(
        `Lifecycle notification ${key} for event=${event.id} failed: ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private async allocateCode(tx: PrismaTx): Promise<string> {
    const seq = await this.sequences.nextValue(SEQ_NAMES.EVENT, { tx });
    return `EVT-${seq.toString().padStart(6, '0')}`;
  }

  private assertDateRange(start: Date | string, end: Date | string): void {
    const s = typeof start === 'string' ? new Date(start) : start;
    const e = typeof end === 'string' ? new Date(end) : end;
    if (e.getTime() < s.getTime()) {
      throw new EventDateRangeInvalidError(
        typeof start === 'string' ? start : s.toISOString().slice(0, 10),
        typeof end === 'string' ? end : e.toISOString().slice(0, 10),
      );
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('EventService requires tenant scope.');
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

  private async assertPublishAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      EventsFeatureFlags.ALLOW_PUBLISH,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new EventNotEditableError('<n/a>', 'SCHEDULED', 'publish');
    }
  }

  /**
   * Cross-tenant FK guard — verifies that supplied foreign-key ids belong to
   * the current tenant. Mirrors the pattern used in `FeeInvoiceService`.
   * Caller passes only ids that need checking (omit when undefined/null).
   */
  private async assertTenantRefs(
    tx: PrismaTx,
    schoolId: string,
    refs: {
      readonly branchIds?: readonly string[];
      readonly staffIds?: readonly string[];
      readonly feeHeadIds?: readonly string[];
      readonly feeStructureIds?: readonly string[];
    },
  ): Promise<void> {
    if (refs.branchIds && refs.branchIds.length > 0) {
      const found = await tx.branch.findMany({
        where: { schoolId, id: { in: [...refs.branchIds] }, deletedAt: null },
        select: { id: true },
      });
      const ok = new Set(found.map((r) => r.id));
      for (const id of refs.branchIds) {
        if (!ok.has(id)) {
          throw new EventNotEditableError(id, 'DRAFT', `branchId(${id})`);
        }
      }
    }
    if (refs.staffIds && refs.staffIds.length > 0) {
      const found = await tx.staff.findMany({
        where: { schoolId, id: { in: [...refs.staffIds] }, deletedAt: null },
        select: { id: true },
      });
      const ok = new Set(found.map((r) => r.id));
      for (const id of refs.staffIds) {
        if (!ok.has(id)) {
          throw new EventNotEditableError(id, 'DRAFT', `organizerStaffId(${id})`);
        }
      }
    }
    if (refs.feeHeadIds && refs.feeHeadIds.length > 0) {
      const found = await tx.feeHead.findMany({
        where: { schoolId, id: { in: [...refs.feeHeadIds] }, deletedAt: null },
        select: { id: true },
      });
      const ok = new Set(found.map((r) => r.id));
      for (const id of refs.feeHeadIds) {
        if (!ok.has(id)) {
          throw new EventNotEditableError(id, 'DRAFT', `feeHeadId(${id})`);
        }
      }
    }
    if (refs.feeStructureIds && refs.feeStructureIds.length > 0) {
      const found = await tx.feeStructure.findMany({
        where: { schoolId, id: { in: [...refs.feeStructureIds] }, deletedAt: null },
        select: { id: true },
      });
      const ok = new Set(found.map((r) => r.id));
      for (const id of refs.feeStructureIds) {
        if (!ok.has(id)) {
          throw new EventNotEditableError(id, 'DRAFT', `feeStructureId(${id})`);
        }
      }
    }
  }
}

export type { CreateEventInput, ListEventArgs, UpdateEventInput };
export type {
  EventCategoryValue,
  EventRegistrationTypeValue,
  EventStatusValue,
  EventTypeValue,
};
