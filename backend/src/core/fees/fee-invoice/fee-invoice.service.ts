/**
 * FeeInvoiceService — orchestration for FeeInvoice generation, recompute,
 * apply-fines, void, and soft-delete.
 *
 * Rules (Sprint 9 plan §3-§10):
 *   1. `module.fees` feature flag gate on every mutation.
 *   2. Cross-tenant FK guards for studentId / feeStructureId / classId /
 *      sectionId / academicYearId.
 *   3. Generation: per target student, compute `subtotal = Σ line.amount`,
 *      apply active discounts (FLAT subtract; PERCENT applied per line
 *      capped at `discount.maxAmount`), `taxTotal=0`, `total = subtotal -
 *      discountTotal + taxTotal`. Skip on duplicate (studentId, structureId,
 *      periodFrom). Snapshot one FeeInvoiceLine per applied discount.
 *   4. Invoice number `INV/<FY>/<seq>`; FY=`YYYY-YY` from AcademicYear.startDate.
 *   5. Status machine: DRAFT→SENT (recompute flips), →VOID (manual). PAID /
 *      PARTIAL / REFUNDED owned by payment/refund modules.
 *   6. Fine computation (pure helper) — within grace returns 0; FLAT_ONCE,
 *      FLAT_PER_DAY, PERCENT_PER_DAY supported; capped at `capAmount`.
 *   7. Apply fines: refuses if any LATE_FINE line already exists. Adds one
 *      FeeInvoiceLine with `isLateFine=true`, sourceFinePolicyId set.
 *   8. Void: paidTotal>0 → InvoiceAlreadyPaidError.
 *   9. Delete: DRAFT only; soft-delete.
 *
 * Every mutation publishes a `fees.invoice.*` outbox event + writes a
 * finance-category audit row inside the same transaction (hash chain).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { FeeDiscountRepository } from '../fee-discount/fee-discount.repository';
import { StudentFeeDiscountRepository } from '../fee-discount/student-fee-discount.repository';
import { FeeLateFinePolicyRepository } from '../fee-fine-policy/fee-fine-policy.repository';
import { FeeHeadRepository } from '../fee-head/fee-head.repository';
import { FeeStructureRepository } from '../fee-structure/fee-structure.repository';
import {
  FEE_DECIMAL_PLACES,
  FEE_INVOICE_GENERATE_STUDENTS_MAX,
  FeesFeatureFlags,
  FeesOutboxTopics,
  type FeeInvoiceStatusValue,
} from '../fees.constants';
import {
  FeeInvoiceNotFoundError,
  FeeInvoiceStatusTransitionError,
  FeeStructureNotFoundError,
  FeeStructureNotPublishedError,
  FeesBulkLimitExceededError,
  FeesCrossTenantReferenceError,
  FeesModuleDisabledError,
  FineAlreadyAppliedError,
  InvoiceAlreadyPaidError,
} from '../fees.errors';
import type {
  ComputedFine,
  FeeDiscountRow,
  FeeHeadRow,
  FeeInvoiceLineRow,
  FeeInvoiceRow,
  FeeInvoiceWithLines,
  FeeLateFinePolicyRow,
  FeeStructureLineRow,
  FeeStructureWithLines,
  StudentFeeDiscountRow,
} from '../fees.types';
import {
  FeeInvoiceRepository,
  type CreateFeeInvoiceLineInput,
  type ListFeeInvoiceArgs,
} from './fee-invoice.repository';

export type FeeInvoiceGenerateScope = 'students' | 'class' | 'section';

export interface GenerateInvoicesArgs {
  readonly structureId: string;
  readonly periodFrom: Date;
  readonly periodTo: Date;
  readonly issueDate: Date;
  readonly dueDate: Date;
  readonly scope: FeeInvoiceGenerateScope;
  readonly studentIds?: readonly string[];
  readonly classId?: string;
  readonly sectionId?: string;
  readonly notes?: string | null;
}

export interface GenerateInvoicesResult {
  readonly generated: number;
  readonly skipped: number;
  readonly invoices: readonly FeeInvoiceWithLines[];
}

interface TenantRefs {
  readonly academicYearIds?: readonly string[];
  readonly classIds?: readonly string[];
  readonly sectionIds?: readonly string[];
  readonly studentIds?: readonly string[];
  readonly feeStructureIds?: readonly string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class FeeInvoiceService {
  private readonly logger = new Logger(FeeInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FeeInvoiceRepository,
    private readonly structureRepo: FeeStructureRepository,
    private readonly headRepo: FeeHeadRepository,
    private readonly finePolicyRepo: FeeLateFinePolicyRepository,
    private readonly discountRepo: FeeDiscountRepository,
    private readonly studentDiscountRepo: StudentFeeDiscountRepository,
    private readonly sequenceService: SequenceService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  public async list(args: ListFeeInvoiceArgs): Promise<{
    readonly items: readonly FeeInvoiceWithLines[];
    readonly nextCursorId: string | null;
  }> {
    const { rows, nextCursorId } = await this.repo.list(args);
    const now = new Date();
    const items: FeeInvoiceWithLines[] = [];
    for (const r of rows) {
      const policy = await this.resolveActivePolicy(r.lines);
      const fine = this.computeFineForInvoice(r.header, policy, now);
      items.push({ ...r.header, lines: r.lines, computedFine: fine.amount });
    }
    return { items, nextCursorId };
  }

  public async getById(id: string): Promise<FeeInvoiceWithLines> {
    const found = await this.repo.findById(id);
    if (found === null) throw new FeeInvoiceNotFoundError(id);
    const policy = await this.resolveActivePolicy(found.lines);
    const fine = this.computeFineForInvoice(found.header, policy, new Date());
    return { ...found.header, lines: found.lines, computedFine: fine.amount };
  }

  // -------------------------------------------------------------------------
  // Generate
  // -------------------------------------------------------------------------

  public async generate(args: GenerateInvoicesArgs): Promise<GenerateInvoicesResult> {
    await this.assertModuleEnabled();
    this.assertDateOrder(args.periodFrom, args.periodTo, 'period.from', 'period.to');
    this.assertDateOrder(args.issueDate, args.dueDate, 'issueDate', 'dueDate');
    this.assertScopeShape(args);

    return this.prisma.transaction(async (tx) => {
      const structure = await this.structureRepo.findById(args.structureId, tx);
      if (structure === null) throw new FeeStructureNotFoundError(args.structureId);
      if (structure.status !== 'PUBLISHED') {
        throw new FeeStructureNotPublishedError(structure.id, structure.status);
      }
      if (structure.lines.length === 0) {
        throw new FeesBulkLimitExceededError(1, 0);
      }

      const targetStudentIds = await this.resolveTargetStudents(tx, args, structure);
      if (targetStudentIds.length > FEE_INVOICE_GENERATE_STUDENTS_MAX) {
        throw new FeesBulkLimitExceededError(
          FEE_INVOICE_GENERATE_STUDENTS_MAX,
          targetStudentIds.length,
        );
      }
      if (targetStudentIds.length === 0) {
        return { generated: 0, skipped: 0, invoices: [] };
      }

      await this.assertTenantRefs(tx, {
        academicYearIds: [structure.academicYearId],
        feeStructureIds: [structure.id],
        studentIds: targetStudentIds,
        ...(args.classId !== undefined ? { classIds: [args.classId] } : {}),
        ...(args.sectionId !== undefined ? { sectionIds: [args.sectionId] } : {}),
      });

      const academicYear = await this.loadAcademicYearOrThrow(
        tx,
        structure.academicYearId,
      );
      const fiscalYear = this.computeFiscalYear(academicYear.startDate);
      const headCache = new Map<string, FeeHeadRow>();

      const generated: FeeInvoiceWithLines[] = [];
      let skippedCount = 0;

      for (const studentId of targetStudentIds) {
        const dup = await this.repo.findActiveForStudentPeriod(
          studentId,
          structure.id,
          args.periodFrom,
          tx,
        );
        if (dup !== null) {
          skippedCount += 1;
          continue;
        }

        const discounts = await this.loadActiveDiscountsForStudent(
          tx,
          studentId,
          structure.academicYearId,
          args.periodFrom,
        );

        const draft = await this.buildInvoiceDraft({
          structure,
          discounts,
          headCache,
          tx,
        });

        const seq = await this.sequenceService.nextValue(SEQ_NAMES.INVOICE, {
          fiscalYear,
          tx,
        });
        const invoiceNo = this.formatInvoiceNo(fiscalYear, seq);

        const created = await this.repo.create(
          {
            studentId,
            feeStructureId: structure.id,
            academicYearId: structure.academicYearId,
            branchId: structure.branchId,
            invoiceNo,
            periodFrom: args.periodFrom,
            periodTo: args.periodTo,
            issueDate: args.issueDate,
            dueDate: args.dueDate,
            subtotal: draft.subtotal,
            discountTotal: draft.discountTotal,
            taxTotal: draft.taxTotal,
            total: draft.total,
            notes: args.notes ?? null,
            lines: draft.lines,
          },
          tx,
        );

        const policy = await this.resolveActivePolicy(created.lines);
        const fine = this.computeFineForInvoice(created.header, policy, new Date());
        const assembled: FeeInvoiceWithLines = {
          ...created.header,
          lines: created.lines,
          computedFine: fine.amount,
        };
        generated.push(assembled);

        await this.audit.record(
          {
            action: 'fee_invoice.generate',
            category: 'finance',
            resourceType: 'FeeInvoice',
            resourceId: created.header.id,
            after: assembled,
          },
          { tx: tx as unknown as AuditTxLike },
        );
      }

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.INVOICE_GENERATED,
        eventType: 'FeeInvoicesGenerated',
        aggregateType: 'FeeStructure',
        aggregateId: structure.id,
        payload: {
          structureId: structure.id,
          academicYearId: structure.academicYearId,
          periodFrom: args.periodFrom.toISOString(),
          periodTo: args.periodTo.toISOString(),
          generated: generated.length,
          skipped: skippedCount,
          invoiceIds: generated.map((i) => i.id),
        },
      });

      this.logger.log(
        `Generated invoices structureId=${structure.id} generated=${generated.length} skipped=${skippedCount}.`,
      );

      return {
        generated: generated.length,
        skipped: skippedCount,
        invoices: generated,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Recompute
  // -------------------------------------------------------------------------

  public async recompute(
    id: string,
    expectedVersion: number,
  ): Promise<FeeInvoiceWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeInvoiceNotFoundError(id);
      if (!this.canRecompute(current.header.status)) {
        throw new FeeInvoiceStatusTransitionError(current.header.status, 'SENT');
      }

      const structure = await this.structureRepo.findById(
        current.header.feeStructureId,
        tx,
      );
      if (structure === null) {
        throw new FeeStructureNotFoundError(current.header.feeStructureId);
      }

      const discounts = await this.loadActiveDiscountsForStudent(
        tx,
        current.header.studentId,
        current.header.academicYearId,
        current.header.periodFrom,
      );

      const headCache = new Map<string, FeeHeadRow>();
      const draft = await this.buildInvoiceDraft({
        structure,
        discounts,
        headCache,
        tx,
      });

      await this.repo.replaceNonFineLines(id, draft.lines, tx);

      // Preserve already-frozen late-fine total in the invoice total.
      const fineLines = current.lines.filter((l) => l.isLateFine);
      const fineSum = fineLines.reduce((acc, l) => acc + l.lineTotal, 0);
      const totalWithFine = round2(draft.total + fineSum);

      const nextStatus: FeeInvoiceStatusValue =
        current.header.status === 'DRAFT' ? 'SENT' : current.header.status;

      const updatedHeader = await this.repo.updateTotals(
        id,
        expectedVersion,
        {
          subtotal: draft.subtotal,
          discountTotal: draft.discountTotal,
          taxTotal: draft.taxTotal,
          total: totalWithFine,
          status: nextStatus,
        },
        tx,
      );

      const reloaded = await this.repo.findById(id, tx);
      if (reloaded === null) throw new FeeInvoiceNotFoundError(id);
      const policy = await this.resolveActivePolicy(reloaded.lines);
      const fine = this.computeFineForInvoice(reloaded.header, policy, new Date());
      const assembled: FeeInvoiceWithLines = {
        ...reloaded.header,
        lines: reloaded.lines,
        computedFine: fine.amount,
      };

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.INVOICE_RECOMPUTED,
        eventType: 'FeeInvoiceRecomputed',
        aggregateType: 'FeeInvoice',
        aggregateId: id,
        payload: {
          id,
          total: updatedHeader.total,
          status: updatedHeader.status,
        },
      });

      await this.audit.record(
        {
          action: 'fee_invoice.recompute',
          category: 'finance',
          resourceType: 'FeeInvoice',
          resourceId: id,
          before: { ...current.header, lines: current.lines },
          after: assembled,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(`FeeInvoice recomputed id=${id} total=${updatedHeader.total}.`);
      return assembled;
    });
  }

  // -------------------------------------------------------------------------
  // Apply fines
  // -------------------------------------------------------------------------

  public async applyFines(
    id: string,
    expectedVersion: number,
  ): Promise<FeeInvoiceWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeInvoiceNotFoundError(id);

      if (!this.canApplyFines(current.header.status)) {
        throw new FeeInvoiceStatusTransitionError(current.header.status, 'OVERDUE');
      }

      const alreadyApplied = current.lines.some((l) => l.isLateFine);
      if (alreadyApplied) throw new FineAlreadyAppliedError(id);

      const policy = await this.resolveActivePolicy(current.lines, tx);
      if (policy === null) {
        throw new FineAlreadyAppliedError(id);
      }
      const fine = this.computeFineForInvoice(current.header, policy, new Date());
      if (fine.amount <= 0) {
        throw new FineAlreadyAppliedError(id);
      }

      const description = `Late fine: ${policy.name} (${fine.daysOverdue} days)`;
      const lateFineHeadId = await this.resolveLateFineHeadId(tx, current.lines);

      await this.repo.addLine(
        id,
        {
          feeHeadId: lateFineHeadId,
          sourceFinePolicyId: policy.id,
          sourceDiscountId: null,
          description,
          quantity: 1,
          unitAmount: fine.amount,
          discountAmount: 0,
          taxAmount: 0,
          lineTotal: fine.amount,
          isLateFine: true,
        },
        tx,
      );

      const newTotal = round2(current.header.total + fine.amount);
      await this.repo.updateTotals(
        id,
        expectedVersion,
        {
          subtotal: current.header.subtotal,
          discountTotal: current.header.discountTotal,
          taxTotal: current.header.taxTotal,
          total: newTotal,
        },
        tx,
      );

      const reloaded = await this.repo.findById(id, tx);
      if (reloaded === null) throw new FeeInvoiceNotFoundError(id);
      const assembled: FeeInvoiceWithLines = {
        ...reloaded.header,
        lines: reloaded.lines,
        computedFine: 0,
      };

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.INVOICE_FINES_APPLIED,
        eventType: 'FeeInvoiceFinesApplied',
        aggregateType: 'FeeInvoice',
        aggregateId: id,
        payload: {
          id,
          policyId: policy.id,
          fineAmount: fine.amount,
          daysOverdue: fine.daysOverdue,
          newTotal,
        },
      });

      await this.audit.record(
        {
          action: 'fee_invoice.apply_fines',
          category: 'finance',
          resourceType: 'FeeInvoice',
          resourceId: id,
          before: { ...current.header, lines: current.lines },
          after: assembled,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `FeeInvoice fines applied id=${id} policyId=${policy.id} amount=${fine.amount}.`,
      );
      return assembled;
    });
  }

  // -------------------------------------------------------------------------
  // Void
  // -------------------------------------------------------------------------

  public async voidInvoice(
    id: string,
    expectedVersion: number,
  ): Promise<FeeInvoiceWithLines> {
    await this.assertModuleEnabled();
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeInvoiceNotFoundError(id);
      if (current.header.paidTotal > 0) {
        throw new InvoiceAlreadyPaidError(id);
      }
      if (current.header.status === 'VOID') {
        throw new FeeInvoiceStatusTransitionError(current.header.status, 'VOID');
      }
      await this.repo.setStatus(id, expectedVersion, 'VOID', tx);
      const reloaded = await this.repo.findById(id, tx);
      if (reloaded === null) throw new FeeInvoiceNotFoundError(id);
      const assembled: FeeInvoiceWithLines = {
        ...reloaded.header,
        lines: reloaded.lines,
        computedFine: 0,
      };

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.INVOICE_VOIDED,
        eventType: 'FeeInvoiceVoided',
        aggregateType: 'FeeInvoice',
        aggregateId: id,
        payload: { id, invoiceNo: current.header.invoiceNo },
      });

      await this.audit.record(
        {
          action: 'fee_invoice.void',
          category: 'finance',
          resourceType: 'FeeInvoice',
          resourceId: id,
          before: { ...current.header, lines: current.lines },
          after: assembled,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeInvoice voided id=${id}.`);
      return assembled;
    });
  }

  // -------------------------------------------------------------------------
  // Soft-delete
  // -------------------------------------------------------------------------

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.assertModuleEnabled();
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) throw new FeeInvoiceNotFoundError(id);
      if (current.header.status !== 'DRAFT') {
        throw new FeeInvoiceStatusTransitionError(current.header.status, 'VOID');
      }
      await this.repo.softDelete(id, expectedVersion, tx);

      await this.outbox.publish(tx, {
        topic: FeesOutboxTopics.INVOICE_DELETED,
        eventType: 'FeeInvoiceDeleted',
        aggregateType: 'FeeInvoice',
        aggregateId: id,
        payload: { id, invoiceNo: current.header.invoiceNo },
      });

      await this.audit.record(
        {
          action: 'fee_invoice.delete',
          category: 'finance',
          resourceType: 'FeeInvoice',
          resourceId: id,
          before: { ...current.header, lines: current.lines },
        },
        { tx: tx as unknown as AuditTxLike },
      );
      this.logger.log(`FeeInvoice soft-deleted id=${id}.`);
    });
  }

  // -------------------------------------------------------------------------
  // Internal: invoice draft (lines + totals + discount snapshots)
  // -------------------------------------------------------------------------

  private async buildInvoiceDraft(args: {
    readonly structure: FeeStructureWithLines;
    readonly discounts: readonly { discount: FeeDiscountRow; assignment: StudentFeeDiscountRow }[];
    readonly headCache: Map<string, FeeHeadRow>;
    readonly tx: PrismaTx;
  }): Promise<{
    readonly subtotal: number;
    readonly discountTotal: number;
    readonly taxTotal: number;
    readonly total: number;
    readonly lines: readonly CreateFeeInvoiceLineInput[];
  }> {
    const structureLines = args.structure.lines;
    const headIds = Array.from(new Set(structureLines.map((l) => l.feeHeadId)));
    for (const hid of headIds) {
      if (!args.headCache.has(hid)) {
        const head = await this.headRepo.findById(hid, args.tx);
        if (head !== null) args.headCache.set(hid, head);
      }
    }

    const lineInputs: CreateFeeInvoiceLineInput[] = [];
    let subtotal = 0;
    for (const sl of structureLines) {
      const head = args.headCache.get(sl.feeHeadId);
      const desc = head?.name ?? sl.feeHeadId;
      lineInputs.push({
        feeHeadId: sl.feeHeadId,
        sourceFinePolicyId: null,
        sourceDiscountId: null,
        description: desc,
        quantity: 1,
        unitAmount: sl.amount,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: sl.amount,
        isLateFine: false,
      });
      subtotal += sl.amount;
    }
    subtotal = round2(subtotal);

    let discountTotal = 0;
    for (const { discount } of args.discounts) {
      const amount = this.computeDiscountAmount(discount, structureLines);
      if (amount <= 0) continue;
      discountTotal += amount;
      const head = args.headCache.get(discount.appliesToFeeHeadId ?? '');
      const headId =
        discount.appliesToFeeHeadId ??
        structureLines[0]?.feeHeadId ??
        '';
      const desc = `Discount: ${discount.code}`;
      lineInputs.push({
        feeHeadId: headId,
        sourceFinePolicyId: null,
        sourceDiscountId: discount.id,
        description: head !== undefined ? `${desc} (${head.name})` : desc,
        quantity: 1,
        unitAmount: amount,
        discountAmount: amount,
        taxAmount: 0,
        lineTotal: amount,
        isLateFine: false,
      });
    }
    discountTotal = round2(discountTotal);
    const taxTotal = 0;
    const total = round2(subtotal - discountTotal + taxTotal);
    return { subtotal, discountTotal, taxTotal, total, lines: lineInputs };
  }

  private computeDiscountAmount(
    discount: FeeDiscountRow,
    lines: readonly FeeStructureLineRow[],
  ): number {
    const eligible =
      discount.appliesToFeeHeadId === null
        ? lines
        : lines.filter((l) => l.feeHeadId === discount.appliesToFeeHeadId);
    if (eligible.length === 0) return 0;
    if (discount.type === 'FLAT') {
      const raw = discount.value;
      const capped =
        discount.maxAmount !== null && discount.maxAmount < raw
          ? discount.maxAmount
          : raw;
      return round2(Math.max(0, capped));
    }
    // PERCENT — per line, capped per line at maxAmount.
    let sum = 0;
    for (const l of eligible) {
      const raw = (l.amount * discount.value) / 100;
      const capped =
        discount.maxAmount !== null && discount.maxAmount < raw
          ? discount.maxAmount
          : raw;
      sum += Math.max(0, capped);
    }
    return round2(sum);
  }

  // -------------------------------------------------------------------------
  // Internal: fine helpers
  // -------------------------------------------------------------------------

  /**
   * Resolves the policy used for fine computation. Per BUSINESS_RULES §6 the
   * policy from the first structure line that carries one wins. We approximate
   * by scanning non-fine invoice lines in their created order, looking up
   * their structure line via fee head match — but for simplicity here we just
   * pull every distinct policy id off any line that has sourceFinePolicyId set
   * (from earlier apply-fines) and fall back to scanning the structure.
   *
   * Concretely: if the invoice already has a LATE_FINE line, that line's
   * `sourceFinePolicyId` is the policy. Otherwise we look up the policy id
   * from the source FeeStructureLine[].
   */
  private async resolveActivePolicy(
    lines: readonly FeeInvoiceLineRow[],
    tx?: PrismaTx,
  ): Promise<FeeLateFinePolicyRow | null> {
    const fromFineLine = lines.find(
      (l) => l.isLateFine && l.sourceFinePolicyId !== null,
    );
    if (fromFineLine !== undefined && fromFineLine.sourceFinePolicyId !== null) {
      return this.finePolicyRepo.findById(fromFineLine.sourceFinePolicyId, tx);
    }
    if (lines.length === 0) return null;
    // Look up the source structure via the first line's invoice -> structure
    // -> structure lines -> first late-fine policy. Cheap because the
    // structure lines collection is bounded (FEE_STRUCTURE_LINES_MAX=50).
    const reader = (tx ?? null) ?? undefined;
    const invoiceId = lines[0]?.feeInvoiceId;
    if (invoiceId === undefined) return null;
    const found = await this.repo.findById(invoiceId, reader);
    if (found === null) return null;
    const structure = await this.structureRepo.findById(
      found.header.feeStructureId,
      reader,
    );
    if (structure === null) return null;
    const policyLine = structure.lines.find((l) => l.lateFinePolicyId !== null);
    if (policyLine === undefined || policyLine.lateFinePolicyId === null) {
      return null;
    }
    return this.finePolicyRepo.findById(policyLine.lateFinePolicyId, reader);
  }

  /**
   * Pure fine computation per plan §6. Returns 0 for terminal states.
   */
  private computeFineForInvoice(
    invoice: FeeInvoiceRow,
    policy: FeeLateFinePolicyRow | null,
    now: Date,
  ): ComputedFine {
    if (
      invoice.status === 'VOID' ||
      invoice.status === 'PAID' ||
      invoice.status === 'REFUNDED'
    ) {
      return { amount: 0, daysOverdue: 0, policyId: null, cappedAt: null };
    }
    if (policy === null) {
      return { amount: 0, daysOverdue: 0, policyId: null, cappedAt: null };
    }
    return computeFine(invoice, policy, now);
  }

  /**
   * Pick the FeeHead to attach to the late-fine line. Prefers a fee head with
   * category=LATE_FINE if any line on the invoice references one; falls back
   * to the first non-fine line's fee head.
   */
  private async resolveLateFineHeadId(
    tx: PrismaTx,
    lines: readonly FeeInvoiceLineRow[],
  ): Promise<string> {
    for (const l of lines) {
      if (l.isLateFine) continue;
      const head = await this.headRepo.findById(l.feeHeadId, tx);
      if (head !== null && head.category === 'LATE_FINE') return head.id;
    }
    const nonFine = lines.find((l) => !l.isLateFine);
    if (nonFine !== undefined) return nonFine.feeHeadId;
    if (lines.length === 0) {
      throw new Error('FeeInvoice has no lines; cannot resolve late-fine head.');
    }
    return lines[0]!.feeHeadId;
  }

  // -------------------------------------------------------------------------
  // Internal: targets / FY / discounts
  // -------------------------------------------------------------------------

  private async resolveTargetStudents(
    tx: PrismaTx,
    args: GenerateInvoicesArgs,
    structure: FeeStructureWithLines,
  ): Promise<readonly string[]> {
    const schoolId = this.requireSchoolId();
    if (args.scope === 'students') {
      const ids = args.studentIds ?? [];
      return Array.from(new Set(ids));
    }
    if (args.scope === 'class' && args.classId !== undefined) {
      const rows = await tx.student.findMany({
        where: {
          schoolId,
          classId: args.classId,
          academicYearId: structure.academicYearId,
          deletedAt: null,
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    if (args.scope === 'section' && args.sectionId !== undefined) {
      const rows = await tx.student.findMany({
        where: {
          schoolId,
          sectionId: args.sectionId,
          academicYearId: structure.academicYearId,
          deletedAt: null,
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }
    return [];
  }

  private async loadActiveDiscountsForStudent(
    tx: PrismaTx,
    studentId: string,
    academicYearId: string,
    onDate: Date,
  ): Promise<
    readonly {
      readonly discount: FeeDiscountRow;
      readonly assignment: StudentFeeDiscountRow;
    }[]
  > {
    const assignments = await this.studentDiscountRepo.findActiveForStudent(
      studentId,
      academicYearId,
      onDate,
      tx,
    );
    const approved = assignments.filter((a) => a.approvedAt !== null);
    const out: { discount: FeeDiscountRow; assignment: StudentFeeDiscountRow }[] = [];
    for (const a of approved) {
      const d = await this.discountRepo.findById(a.feeDiscountId, tx);
      if (d !== null) out.push({ discount: d, assignment: a });
    }
    return out;
  }

  private async loadAcademicYearOrThrow(
    tx: PrismaTx,
    id: string,
  ): Promise<{ readonly id: string; readonly startDate: Date }> {
    const schoolId = this.requireSchoolId();
    const row = await tx.academicYear.findFirst({
      where: { schoolId, id, deletedAt: null },
      select: { id: true, startDate: true },
    });
    if (row === null) {
      throw new FeesCrossTenantReferenceError('AcademicYear', id);
    }
    return row;
  }

  private computeFiscalYear(startDate: Date): string {
    const startYear = startDate.getUTCFullYear();
    const endTwo = ((startYear + 1) % 100).toString().padStart(2, '0');
    return `${startYear}-${endTwo}`;
  }

  private formatInvoiceNo(fiscalYear: string, seq: number): string {
    const seqStr = seq.toString().padStart(6, '0');
    return `INV/${fiscalYear}/${seqStr}`;
  }

  // -------------------------------------------------------------------------
  // Status guards
  // -------------------------------------------------------------------------

  private canRecompute(status: FeeInvoiceStatusValue): boolean {
    return status === 'DRAFT' || status === 'SENT' || status === 'PARTIAL';
  }

  private canApplyFines(status: FeeInvoiceStatusValue): boolean {
    return (
      status === 'DRAFT' ||
      status === 'SENT' ||
      status === 'PARTIAL' ||
      status === 'OVERDUE'
    );
  }

  // -------------------------------------------------------------------------
  // Validators
  // -------------------------------------------------------------------------

  private assertScopeShape(args: GenerateInvoicesArgs): void {
    if (args.scope === 'students') {
      if (args.studentIds === undefined || args.studentIds.length === 0) {
        throw new FeesBulkLimitExceededError(
          FEE_INVOICE_GENERATE_STUDENTS_MAX,
          0,
        );
      }
    } else if (args.scope === 'class') {
      if (args.classId === undefined) {
        throw new FeesCrossTenantReferenceError('Class', '');
      }
    } else if (args.scope === 'section') {
      if (args.sectionId === undefined) {
        throw new FeesCrossTenantReferenceError('Section', '');
      }
    }
  }

  private assertDateOrder(
    a: Date,
    b: Date,
    aLabel: string,
    bLabel: string,
  ): void {
    if (a.getTime() > b.getTime()) {
      throw new FeesCrossTenantReferenceError(
        `${aLabel} must be <= ${bLabel}`,
        '',
      );
    }
  }

  private async assertTenantRefs(tx: PrismaTx, refs: TenantRefs): Promise<void> {
    const schoolId = this.requireSchoolId();
    for (const id of dedupe(refs.academicYearIds)) {
      const found = await tx.academicYear.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('AcademicYear', id);
    }
    for (const id of dedupe(refs.classIds)) {
      const found = await tx.class.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Class', id);
    }
    for (const id of dedupe(refs.sectionIds)) {
      const found = await tx.section.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Section', id);
    }
    for (const id of dedupe(refs.studentIds)) {
      const found = await tx.student.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) throw new FeesCrossTenantReferenceError('Student', id);
    }
    for (const id of dedupe(refs.feeStructureIds)) {
      const found = await tx.feeStructure.findFirst({
        where: { schoolId, id, deletedAt: null },
        select: { id: true },
      });
      if (found === null) {
        throw new FeesCrossTenantReferenceError('FeeStructure', id);
      }
    }
  }

  private requireSchoolId(): string {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeInvoiceService requires tenant scope.');
    }
    return ctx.schoolId;
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(FeesFeatureFlags.MODULE, {
      schoolId: ctx.schoolId ?? null,
    });
    if (!enabled) throw new FeesModuleDisabledError();
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Pure fine computation (plan §6).
 *
 *   - today <= dueDate + gracePeriodDays → 0.
 *   - daysOverdue = whole days past (dueDate + gracePeriodDays).
 *   - FLAT_ONCE      → policy.value.
 *   - FLAT_PER_DAY   → policy.value * daysOverdue.
 *   - PERCENT_PER_DAY → invoice.total * value/100 * daysOverdue.
 *   - Capped at policy.capAmount when set.
 */
export function computeFine(
  invoice: { readonly total: number; readonly dueDate: Date },
  policy: {
    readonly id: string;
    readonly type: FeeLateFinePolicyRow['type'];
    readonly value: number;
    readonly gracePeriodDays: number;
    readonly capAmount: number | null;
  },
  now: Date,
): ComputedFine {
  const dueWithGrace = new Date(
    invoice.dueDate.getTime() + policy.gracePeriodDays * MS_PER_DAY,
  );
  if (now.getTime() <= dueWithGrace.getTime()) {
    return { amount: 0, daysOverdue: 0, policyId: policy.id, cappedAt: null };
  }
  const diffMs = now.getTime() - dueWithGrace.getTime();
  const daysOverdue = Math.floor(diffMs / MS_PER_DAY);
  if (daysOverdue <= 0) {
    return { amount: 0, daysOverdue: 0, policyId: policy.id, cappedAt: null };
  }
  let raw = 0;
  switch (policy.type) {
    case 'FLAT_ONCE':
      raw = policy.value;
      break;
    case 'FLAT_PER_DAY':
      raw = policy.value * daysOverdue;
      break;
    case 'PERCENT_PER_DAY':
      raw = (invoice.total * policy.value * daysOverdue) / 100;
      break;
  }
  raw = Math.max(0, raw);
  let cappedAt: number | null = null;
  if (policy.capAmount !== null && raw > policy.capAmount) {
    raw = policy.capAmount;
    cappedAt = policy.capAmount;
  }
  return {
    amount: round2(raw),
    daysOverdue,
    policyId: policy.id,
    cappedAt,
  };
}

function round2(v: number): number {
  const factor = Math.pow(10, FEE_DECIMAL_PLACES);
  return Math.round(v * factor) / factor;
}

function dedupe(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined || values.length === 0) return [];
  return Array.from(new Set(values));
}

export const __test__ = { computeFine, round2 };
