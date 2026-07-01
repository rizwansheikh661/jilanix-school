/**
 * EventResultService — CRUD over EventResult ledger rows. No certificate
 * generation in Sprint 11; this service simply records outcomes.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { EventParticipantRepository } from '../event-participant/event-participant.repository';
import { EventRepository } from '../event/event.repository';
import {
  EventsFeatureFlags,
  EventsOutboxTopics,
} from '../events.constants';
import {
  EventNotFoundError,
  EventParticipantNotFoundError,
  EventResultNotFoundError,
  EventsModuleDisabledError,
} from '../events.errors';
import type { EventResultRow } from '../events.types';
import {
  EventResultRepository,
  type CreateEventResultInput,
  type ListEventResultArgs,
  type UpdateEventResultInput,
} from './event-result.repository';

export type CreateEventResultArgs = CreateEventResultInput;
export type UpdateEventResultArgs = UpdateEventResultInput;

@Injectable()
export class EventResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventResultRepository,
    private readonly eventRepo: EventRepository,
    private readonly participantRepo: EventParticipantRepository,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListEventResultArgs): Promise<{
    readonly items: readonly EventResultRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async create(
    eventId: string,
    args: CreateEventResultArgs,
  ): Promise<EventResultRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const event = await this.eventRepo.findById(eventId, tx);
      if (event === null) throw new EventNotFoundError(eventId);

      const participant = await this.participantRepo.findById(
        args.participantId,
        tx,
      );
      if (participant === null || participant.eventId !== eventId) {
        throw new EventParticipantNotFoundError(args.participantId);
      }

      const created = await this.repo.create({ ...args, eventId }, tx);
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.RESULT_RECORDED,
        eventType: 'EventResultRecorded',
        aggregateType: 'EventResult',
        aggregateId: created.id,
        payload: {
          id: created.id,
          eventId,
          participantId: args.participantId,
          position: args.position,
          rank: args.rank ?? null,
        },
      });
      await this.audit.record(
        {
          action: 'event-result.create',
          category: 'general',
          resourceType: 'EventResult',
          resourceId: created.id,
          after: created,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return created;
    });
  }

  public async update(
    eventId: string,
    resultId: string,
    expectedVersion: number,
    args: UpdateEventResultArgs,
  ): Promise<EventResultRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(resultId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventResultNotFoundError(resultId);
      }
      const updated = await this.repo.update(resultId, expectedVersion, args, tx);
      await this.audit.record(
        {
          action: 'event-result.update',
          category: 'general',
          resourceType: 'EventResult',
          resourceId: resultId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async softDelete(
    eventId: string,
    resultId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(resultId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventResultNotFoundError(resultId);
      }
      await this.repo.softDelete(resultId, expectedVersion, tx);
      await this.audit.record(
        {
          action: 'event-result.delete',
          category: 'general',
          resourceType: 'EventResult',
          resourceId: resultId,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(EventsFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new EventsModuleDisabledError();
  }
}
