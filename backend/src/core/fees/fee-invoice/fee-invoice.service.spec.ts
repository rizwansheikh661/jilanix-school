/**
 * FeeInvoiceService unit specs — generate, recompute, void, softDelete.
 *
 * Persistence is mocked; we focus on the orchestration layer:
 *   - one invoice per target student with `Σ line.amount` subtotal
 *   - FLAT student discount written as snapshot line with sourceDiscountId
 *   - duplicates (studentId × structureId × periodFrom) are skipped
 *   - recompute re-applies discounts + emits invoice.recomputed
 *   - void refused when paidTotal>0; succeeds + emits invoice.voided
 *   - softDelete refused unless status=DRAFT
 */
import { RequestContextRegistry } from '../../request-context';
import { FeesOutboxTopics } from '../fees.constants';
import {
  FeeInvoiceStatusTransitionError,
  InvoiceAlreadyPaidError,
} from '../fees.errors';
import type {
  FeeDiscountRow,
  FeeInvoiceLineRow,
  FeeInvoiceRow,
  FeeStructureLineRow,
  FeeStructureWithLines,
  StudentFeeDiscountRow,
} from '../fees.types';
import { FeeInvoiceService } from './fee-invoice.service';

const SCHOOL = 'sch-1';
const NOW = new Date('2026-06-20T00:00:00.000Z');

function makeStructureLine(over: Partial<FeeStructureLineRow> = {}): FeeStructureLineRow {
  return {
    id: 'fsl-1',
    schoolId: SCHOOL,
    feeStructureId: 'fs-1',
    feeHeadId: 'fh-tuition',
    lateFinePolicyId: null,
    amount: 1000,
    frequency: 'MONTHLY',
    dueDay: null,
    ordering: 1,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makeStructure(over: Partial<FeeStructureWithLines> = {}): FeeStructureWithLines {
  return {
    id: 'fs-1',
    schoolId: SCHOOL,
    academicYearId: 'ay-1',
    branchId: null,
    name: 'Annual',
    appliesTo: 'SCHOOL',
    classId: null,
    sectionId: null,
    studentId: null,
    currency: 'INR',
    status: 'PUBLISHED',
    publishedAt: NOW,
    archivedAt: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    lines: [makeStructureLine({ amount: 1000 }), makeStructureLine({ id: 'fsl-2', amount: 500, ordering: 2 })],
    ...over,
  };
}

function makeInvoiceHeader(over: Partial<FeeInvoiceRow> = {}): FeeInvoiceRow {
  return {
    id: 'inv-1',
    schoolId: SCHOOL,
    studentId: 'st-1',
    feeStructureId: 'fs-1',
    academicYearId: 'ay-1',
    branchId: null,
    invoiceNo: 'INV/2026-27/000001',
    periodFrom: new Date('2026-06-01T00:00:00.000Z'),
    periodTo: new Date('2026-06-30T00:00:00.000Z'),
    issueDate: NOW,
    dueDate: new Date('2026-07-10T00:00:00.000Z'),
    subtotal: 1500,
    discountTotal: 0,
    taxTotal: 0,
    total: 1500,
    paidTotal: 0,
    refundTotal: 0,
    balanceTotal: 1500,
    status: 'DRAFT',
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makeInvoiceLine(over: Partial<FeeInvoiceLineRow> = {}): FeeInvoiceLineRow {
  return {
    id: 'il-1',
    schoolId: SCHOOL,
    feeInvoiceId: 'inv-1',
    feeHeadId: 'fh-tuition',
    sourceFinePolicyId: null,
    sourceDiscountId: null,
    description: 'Tuition',
    quantity: 1,
    unitAmount: 1000,
    discountAmount: 0,
    taxAmount: 0,
    lineTotal: 1000,
    isLateFine: false,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    ...over,
  };
}

function makeService() {
  const tx = {
    academicYear: {
      findFirst: jest.fn(async () => ({ id: 'ay-1', startDate: new Date('2026-04-01T00:00:00.000Z') })),
    },
    class: { findFirst: jest.fn(async () => ({ id: 'cls-1' })) },
    section: { findFirst: jest.fn(async () => ({ id: 'sec-1' })) },
    student: { findFirst: jest.fn(async () => ({ id: 'st-1' })) },
    feeStructure: { findFirst: jest.fn(async () => ({ id: 'fs-1' })) },
    feeInvoice: { findFirst: jest.fn(async () => null) },
  };
  const prisma = {
    client: tx,
    transaction: jest.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
  };

  const repo = {
    list: jest.fn(),
    findById: jest.fn(async () => null) as jest.Mock,
    findActiveForStudentPeriod: jest.fn(async () => null),
    create: jest.fn(),
    replaceNonFineLines: jest.fn(async () => []),
    addLine: jest.fn(),
    updateTotals: jest.fn(async () => makeInvoiceHeader({ version: 2 })),
    setStatus: jest.fn(async () => makeInvoiceHeader({ status: 'VOID', version: 2 })),
    softDelete: jest.fn(),
  };
  const structureRepo = { findById: jest.fn(async () => makeStructure()) };
  const headRepo = {
    findById: jest.fn(async (id: string) => ({
      id,
      schoolId: SCHOOL,
      code: 'TUI',
      name: 'Tuition',
      category: 'TUITION',
      hsnSac: null,
      isRefundable: true,
      isTaxable: false,
      defaultAmount: null,
      glAccount: null,
      description: null,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    })),
  };
  const finePolicyRepo = { findById: jest.fn(async () => null) };
  const discountRepo = { findById: jest.fn(async () => null) };
  const studentDiscountRepo = {
    findActiveForStudent: jest.fn(async () => [] as StudentFeeDiscountRow[]),
  };
  const sequenceService = { nextValue: jest.fn(async () => 1) };
  const featureFlags = { isEnabled: jest.fn(async () => true) };
  const outbox = { publish: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => ({ id: 'a', rowHash: 'h' })) };

  const svc = new FeeInvoiceService(
    prisma as never,
    repo as never,
    structureRepo as never,
    headRepo as never,
    finePolicyRepo as never,
    discountRepo as never,
    studentDiscountRepo as never,
    sequenceService as never,
    featureFlags as never,
    outbox as never,
    audit as never,
  );
  return {
    svc,
    prisma,
    tx,
    repo,
    structureRepo,
    headRepo,
    finePolicyRepo,
    discountRepo,
    studentDiscountRepo,
    sequenceService,
    featureFlags,
    outbox,
    audit,
  };
}

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = RequestContextRegistry.makeSystemContext({ schoolId: SCHOOL, actorScope: 'tenant' });
  return RequestContextRegistry.run(ctx, fn);
}

const STD_GEN_ARGS = {
  structureId: 'fs-1',
  periodFrom: new Date('2026-06-01T00:00:00.000Z'),
  periodTo: new Date('2026-06-30T00:00:00.000Z'),
  issueDate: NOW,
  dueDate: new Date('2026-07-10T00:00:00.000Z'),
  scope: 'students' as const,
};

describe('FeeInvoiceService.generate', () => {
  it('writes one invoice per target student with subtotal = Σ line.amount', async () => {
    const t = makeService();
    let seq = 0;
    t.repo.create.mockImplementation(async (input) => {
      seq += 1;
      const header = makeInvoiceHeader({
        id: `inv-${seq}`,
        studentId: input.studentId,
        subtotal: input.subtotal,
        total: input.total,
        balanceTotal: input.total,
      });
      const lines = input.lines.map((l: { lineTotal: number; description: string }, i: number) =>
        makeInvoiceLine({ id: `il-${seq}-${i}`, lineTotal: l.lineTotal, description: l.description, feeInvoiceId: header.id }),
      );
      return { header, lines };
    });

    const result = await withCtx(() =>
      t.svc.generate({ ...STD_GEN_ARGS, studentIds: ['st-1', 'st-2'] }),
    );
    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);
    // Subtotal = 1000 + 500 = 1500 per invoice.
    expect(result.invoices[0]!.subtotal).toBe(1500);
    expect(result.invoices[0]!.total).toBe(1500);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.INVOICE_GENERATED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee_invoice.generate' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it('applies a FLAT student discount as a snapshot line with sourceDiscountId set', async () => {
    const t = makeService();
    const discount: FeeDiscountRow = {
      id: 'd-1',
      schoolId: SCHOOL,
      code: 'SCHOL10',
      name: 'Scholarship',
      type: 'FLAT',
      value: 200,
      maxAmount: null,
      appliesToFeeHeadId: null,
      description: null,
      requiresApprovalAbove: null,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    };
    const assignment: StudentFeeDiscountRow = {
      id: 'sd-1',
      schoolId: SCHOOL,
      studentId: 'st-1',
      feeDiscountId: 'd-1',
      academicYearId: 'ay-1',
      validFrom: new Date('2026-01-01'),
      validTo: null,
      reason: null,
      approvedAt: NOW,
      approvedBy: null,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    };
    t.studentDiscountRepo.findActiveForStudent.mockResolvedValue([assignment]);
    (t.discountRepo.findById as jest.Mock).mockResolvedValue(discount);

    t.repo.create.mockImplementation(async (input) => {
      const header = makeInvoiceHeader({
        id: 'inv-1',
        studentId: input.studentId,
        subtotal: input.subtotal,
        discountTotal: input.discountTotal,
        total: input.total,
        balanceTotal: input.total,
      });
      const lines = input.lines.map(
        (l: { lineTotal: number; description: string; sourceDiscountId: string | null }, i: number) =>
          makeInvoiceLine({
            id: `il-${i}`,
            lineTotal: l.lineTotal,
            description: l.description,
            sourceDiscountId: l.sourceDiscountId,
            feeInvoiceId: header.id,
          }),
      );
      return { header, lines };
    });

    const result = await withCtx(() =>
      t.svc.generate({ ...STD_GEN_ARGS, studentIds: ['st-1'] }),
    );
    expect(result.generated).toBe(1);
    const createInput = t.repo.create.mock.calls[0]![0] as {
      lines: Array<{ sourceDiscountId: string | null }>;
      discountTotal: number;
      total: number;
    };
    const discountLine = createInput.lines.find((l) => l.sourceDiscountId === 'd-1');
    expect(discountLine).toBeDefined();
    expect(createInput.discountTotal).toBe(200);
    expect(createInput.total).toBe(1300); // 1500 - 200
  });

  it('skips students who already have an active invoice for the same period', async () => {
    const t = makeService();
    (t.repo.findActiveForStudentPeriod as jest.Mock).mockImplementation(async (studentId: string) =>
      studentId === 'st-2' ? makeInvoiceHeader({ studentId: 'st-2' }) : null,
    );
    t.repo.create.mockImplementation(async (input) => ({
      header: makeInvoiceHeader({ id: 'inv-new', studentId: input.studentId }),
      lines: [],
    }));

    const result = await withCtx(() =>
      t.svc.generate({ ...STD_GEN_ARGS, studentIds: ['st-1', 'st-2'] }),
    );
    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(t.repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('FeeInvoiceService.recompute', () => {
  it('re-applies discounts, updates totals + emits invoice.recomputed', async () => {
    const t = makeService();
    const current = { header: makeInvoiceHeader({ status: 'SENT' }), lines: [makeInvoiceLine()] };
    const reloaded = {
      header: makeInvoiceHeader({ status: 'SENT', version: 2, subtotal: 1500, total: 1500 }),
      lines: [makeInvoiceLine()],
    };
    t.repo.findById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(reloaded);

    const out = await withCtx(() => t.svc.recompute('inv-1', 1));
    expect(out.id).toBe('inv-1');
    expect(t.repo.replaceNonFineLines).toHaveBeenCalledTimes(1);
    expect(t.repo.updateTotals).toHaveBeenCalledTimes(1);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.INVOICE_RECOMPUTED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee_invoice.recompute' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });
});

describe('FeeInvoiceService.voidInvoice', () => {
  it('refuses when paidTotal>0 → InvoiceAlreadyPaidError', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue({
      header: makeInvoiceHeader({ paidTotal: 500, balanceTotal: 1000, status: 'PARTIAL' }),
      lines: [],
    });
    await expect(withCtx(() => t.svc.voidInvoice('inv-1', 1))).rejects.toBeInstanceOf(
      InvoiceAlreadyPaidError,
    );
    expect(t.repo.setStatus).not.toHaveBeenCalled();
  });

  it('succeeds when paidTotal=0 + emits invoice.voided + finance audit', async () => {
    const t = makeService();
    const current = { header: makeInvoiceHeader({ paidTotal: 0 }), lines: [] };
    const reloaded = { header: makeInvoiceHeader({ status: 'VOID', version: 2 }), lines: [] };
    t.repo.findById.mockResolvedValueOnce(current).mockResolvedValueOnce(reloaded);

    const out = await withCtx(() => t.svc.voidInvoice('inv-1', 1));
    expect(out.status).toBe('VOID');
    expect(t.repo.setStatus).toHaveBeenCalledTimes(1);
    expect(t.outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: FeesOutboxTopics.INVOICE_VOIDED }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'finance', action: 'fee_invoice.void' }),
      expect.objectContaining({ tx: expect.anything() }),
    );
  });
});

describe('FeeInvoiceService.softDelete', () => {
  it('refused unless status=DRAFT', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue({
      header: makeInvoiceHeader({ status: 'SENT' }),
      lines: [],
    });
    await expect(withCtx(() => t.svc.softDelete('inv-1', 1))).rejects.toBeInstanceOf(
      FeeInvoiceStatusTransitionError,
    );
    expect(t.repo.softDelete).not.toHaveBeenCalled();
  });
});
