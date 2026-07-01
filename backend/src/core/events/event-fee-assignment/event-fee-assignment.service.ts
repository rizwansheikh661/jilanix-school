/**
 * EventFeeAssignmentService — manages Sprint 11 ↔ Sprint 9 bridge rows.
 *
 * Rules:
 *   - PENDING rows are created at participant-registration time for paid
 *     events (see EventParticipantService.registerInTx). This service does
 *     NOT expose a public `create` endpoint — assignments are an outcome of
 *     registration, never a stand-alone admin action.
 *   - `generateInvoices` is flag-gated by `events.allow_fee_generation`.
 *     Collects PENDING rows, batches by FEE_INVOICE_GENERATION_BATCH_SIZE,
 *     and calls `FeeInvoiceService.generate({scope:'students', studentIds})`
 *     per batch (one structure per call). Patches each generated invoice
 *     back onto the matching assignment row by studentId.
 *   - `void(id)` flips PENDING → VOID. INVOICED rows refuse: admins must
 *     void the underlying invoice via the fees module first.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { FeeInvoiceService } from '../../fees/fee-invoice/fee-invoice.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { EventRepository } from '../event/event.repository';
import {
  EventsFeatureFlags,
  EventsOutboxTopics,
  FEE_INVOICE_GENERATION_BATCH_SIZE,
} from '../events.constants';
import {
  EventFeeAssignmentNotFoundError,
  EventFeeAssignmentNotVoidableError,
  EventFeeGenerationDisabledError,
  EventFeeHeadMissingError,
  EventNotFoundError,
  EventNotPaidError,
  EventsModuleDisabledError,
} from '../events.errors';
import type { EventFeeAssignmentRow } from '../events.types';
import {
  EventFeeAssignmentRepository,
  type ListEventFeeAssignmentArgs,
} from './event-fee-assignment.repository';

export interface GenerateInvoicesSummary {
  readonly invoiced: number;
  readonly skipped: number;
  readonly invoiceIds: readonly string[];
}

@Injectable()
export class EventFeeAssignmentService {
  private readonly logger = new Logger(EventFeeAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventFeeAssignmentRepository,
    private readonly eventRepo: EventRepository,
    private readonly feeInvoiceService: FeeInvoiceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListEventFeeAssignmentArgs): Promise<{
    readonly items: readonly EventFeeAssignmentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async generateInvoices(eventId: string): Promise<GenerateInvoicesSummary> {
    await this.assertModuleEnabled();
    await this.assertFeeGenerationAllowed();

    const event = await this.eventRepo.findById(eventId);
    if (event === null) throw new EventNotFoundError(eventId);
    if (event.isFree) throw new EventNotPaidError(eventId);
    if (event.feeHeadId === null || event.feeStructureId === null) {
      throw new EventFeeHeadMissingError(eventId);
    }

    const pending = await this.repo.listPendingForEvent(eventId);
    if (pending.length === 0) {
      return { invoiced: 0, skipped: 0, invoiceIds: [] };
    }

    const invoiceIds: string[] = [];
    let invoiced = 0;
    let skipped = 0;
    const batches = chunk(pending, FEE_INVOICE_GENERATION_BATCH_SIZE);

    for (const batch of batches) {
      const studentIds = batch.map((a) => a.studentId);
      const result = await this.feeInvoiceService.generate({
        structureId: event.feeStructureId,
        periodFrom: event.startDate,
        periodTo: event.endDate,
        issueDate: new Date(),
        dueDate: event.startDate,
        scope: 'students',
        studentIds,
      });

      const invoiceByStudent = new Map<string, string>();
      for (const inv of result.invoices) {
        invoiceByStudent.set(inv.studentId, inv.id);
      }

      // Patch each assignment in the batch, INSIDE its own transaction so
      // an individual update failure doesn't roll back the entire generation.
      for (const assignment of batch) {
        const invoiceId = invoiceByStudent.get(assignment.studentId);
        if (invoiceId === undefined) {
          skipped += 1;
          continue;
        }
        try {
          await this.prisma.transaction(async (rawTx) => {
            const tx = rawTx as unknown as PrismaTx;
            const updated = await this.repo.markInvoiced(
              assignment.id,
              assignment.version,
              invoiceId,
              tx,
            );
            invoiceIds.push(invoiceId);
            await this.outbox.publish(tx, {
              topic: EventsOutboxTopics.FEE_ASSIGNMENT_INVOICED,
              eventType: 'EventFeeAssignmentInvoiced',
              aggregateType: 'EventFeeAssignment',
              aggregateId: assignment.id,
              payload: {
                id: assignment.id,
                eventId,
                participantId: assignment.participantId,
                studentId: assignment.studentId,
                feeInvoiceId: invoiceId,
              },
            });
            await this.audit.record(
              {
                action: 'event-fee-assignment.invoice',
                category: 'general',
                resourceType: 'EventFeeAssignment',
                resourceId: assignment.id,
                before: assignment,
                after: updated,
              },
              { tx: tx as unknown as AuditTxLike },
            );
          });
          invoiced += 1;
        } catch (err) {
          this.logger.warn(
            `Failed to mark assignment=${assignment.id} as INVOICED: ${(err as Error).message}`,
          );
          skipped += 1;
        }
      }
    }

    this.logger.log(
      `generateInvoices(event=${eventId}): invoiced=${invoiced} skipped=${skipped}.`,
    );
    return { invoiced, skipped, invoiceIds };
  }

  public async voidAssignment(
    eventId: string,
    assignmentId: string,
    expectedVersion: number,
    reason: string | null,
  ): Promise<EventFeeAssignmentRow> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(assignmentId, tx);
      if (current === null || current.eventId !== eventId) {
        throw new EventFeeAssignmentNotFoundError(assignmentId);
      }
      if (current.status !== 'PENDING') {
        throw new EventFeeAssignmentNotVoidableError(assignmentId, current.status);
      }
      const updated = await this.repo.voidOne(
        assignmentId,
        expectedVersion,
        reason,
        tx,
      );
      await this.outbox.publish(tx, {
        topic: EventsOutboxTopics.FEE_ASSIGNMENT_VOIDED,
        eventType: 'EventFeeAssignmentVoided',
        aggregateType: 'EventFeeAssignment',
        aggregateId: assignmentId,
        payload: { id: assignmentId, eventId, reason },
      });
      await this.audit.record(
        {
          action: 'event-fee-assignment.void',
          category: 'general',
          resourceType: 'EventFeeAssignment',
          resourceId: assignmentId,
          before: current,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(EventsFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new EventsModuleDisabledError();
  }

  private async assertFeeGenerationAllowed(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      EventsFeatureFlags.ALLOW_FEE_GENERATION,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new EventFeeGenerationDisabledError();
  }
}

function chunk<T>(arr: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
