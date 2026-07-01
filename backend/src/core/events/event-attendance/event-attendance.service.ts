/**
 * EventAttendanceService — append-only attendance ledger orchestrator.
 *
 * Sprint 11 rules:
 *   - Only MANUAL `method` is writeable. QR/RFID columns reserved for future
 *     scanner integrations.
 *   - "Current status" per participant = the most recent ledger row by
 *     `occurredAt` (ties broken by id). Counters on `Event` are maintained
 *     by computing the DELTA between the previous latest row's status and
 *     the new row's status, then issuing the appropriate
 *     `eventRepo.bumpCounters({attended, absent})` increments inside the
 *     same transaction.
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
import { EventParticipantRepository } from '../event-participant/event-participant.repository';
import {
  EventsFeatureFlags,
  EventsOutboxTopics,
  type EventAttendanceMethodValue,
  type EventAttendanceStatusValue,
} from '../events.constants';
import {
  EventAttendanceMethodUnsupportedError,
  EventNotFoundError,
  EventParticipantNotFoundError,
  EventsModuleDisabledError,
} from '../events.errors';
import type { EventAttendanceRow } from '../events.types';
import {
  EventAttendanceRepository,
  type ListAttendanceArgs,
} from './event-attendance.repository';

export interface MarkAttendanceArgs {
  readonly eventId: string;
  readonly participantId: string;
  readonly status: EventAttendanceStatusValue;
  readonly method: EventAttendanceMethodValue;
  readonly occurredAt?: Date;
  readonly deviceRef?: string | null;
  readonly notes?: string | null;
}

@Injectable()
export class EventAttendanceService {
  private readonly logger = new Logger(EventAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventAttendanceRepository,
    private readonly eventRepo: EventRepository,
    private readonly participantRepo: EventParticipantRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListAttendanceArgs): Promise<{
    readonly items: readonly EventAttendanceRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  /**
   * Aggregate latest status per participant. Useful for the participant
   * roster view to show each registrant's current attendance state.
   */
  public async listLatestPerParticipant(
    eventId: string,
  ): Promise<readonly EventAttendanceRow[]> {
    await this.assertModuleEnabled();
    const map = await this.repo.latestPerParticipant(eventId);
    return Array.from(map.values());
  }

  public async mark(args: MarkAttendanceArgs): Promise<EventAttendanceRow> {
    await this.assertModuleEnabled();
    this.assertMethodSupported(args.method);
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      return this.markInTx(args, tx);
    });
  }

  public async markBulk(
    eventId: string,
    entries: readonly Omit<MarkAttendanceArgs, 'eventId'>[],
  ): Promise<{ marked: number; skipped: number }> {
    await this.assertModuleEnabled();
    for (const e of entries) this.assertMethodSupported(e.method);
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      let marked = 0;
      let skipped = 0;
      for (const entry of entries) {
        try {
          await this.markInTx({ ...entry, eventId }, tx);
          marked += 1;
        } catch (err) {
          if (err instanceof EventParticipantNotFoundError) {
            skipped += 1;
            continue;
          }
          throw err;
        }
      }
      this.logger.log(
        `Bulk attendance for event=${eventId}: marked=${marked} skipped=${skipped}.`,
      );
      return { marked, skipped };
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------
  private async markInTx(
    args: MarkAttendanceArgs,
    tx: PrismaTx,
  ): Promise<EventAttendanceRow> {
    const event = await this.eventRepo.findById(args.eventId, tx);
    if (event === null) throw new EventNotFoundError(args.eventId);

    const participant = await this.participantRepo.findById(args.participantId, tx);
    if (participant === null || participant.eventId !== args.eventId) {
      throw new EventParticipantNotFoundError(args.participantId);
    }

    const previousLatest = await this.repo.latestForParticipant(
      args.eventId,
      args.participantId,
      tx,
    );

    const appended = await this.repo.append(
      {
        eventId: args.eventId,
        participantId: args.participantId,
        status: args.status,
        method: args.method,
        ...(args.occurredAt !== undefined ? { occurredAt: args.occurredAt } : {}),
        deviceRef: args.deviceRef ?? null,
        notes: args.notes ?? null,
      },
      tx,
    );

    const delta = this.computeCounterDelta(
      previousLatest?.status ?? null,
      args.status,
    );
    if (delta.attended !== 0 || delta.absent !== 0) {
      await this.eventRepo.bumpCounters(args.eventId, delta, tx);
    }

    await this.outbox.publish(tx, {
      topic: EventsOutboxTopics.ATTENDANCE_MARKED,
      eventType: 'EventAttendanceMarked',
      aggregateType: 'EventAttendance',
      aggregateId: appended.id,
      payload: {
        id: appended.id,
        eventId: args.eventId,
        participantId: args.participantId,
        status: args.status,
        method: args.method,
        occurredAt: appended.occurredAt.toISOString(),
      },
    });

    await this.audit.record(
      {
        action: 'event-attendance.mark',
        category: 'general',
        resourceType: 'EventAttendance',
        resourceId: appended.id,
        after: appended,
      },
      { tx: tx as unknown as AuditTxLike },
    );

    return appended;
  }

  /**
   * Latest-row-wins delta: only ATTENDED and ABSENT contribute to counters.
   * Transitions REGISTERED → ATTENDED bump attended by +1, etc.
   */
  private computeCounterDelta(
    previous: EventAttendanceStatusValue | null,
    next: EventAttendanceStatusValue,
  ): { attended: number; absent: number } {
    let attended = 0;
    let absent = 0;
    if (previous === 'ATTENDED') attended -= 1;
    if (previous === 'ABSENT') absent -= 1;
    if (next === 'ATTENDED') attended += 1;
    if (next === 'ABSENT') absent += 1;
    return { attended, absent };
  }

  private assertMethodSupported(method: EventAttendanceMethodValue): void {
    if (method !== 'MANUAL') {
      throw new EventAttendanceMethodUnsupportedError(method);
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(EventsFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new EventsModuleDisabledError();
  }
}
