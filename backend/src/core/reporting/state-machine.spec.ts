/**
 * State-machine unit specs — verifies the three transition matrices,
 * terminal sets, cancellable sets, and that asserters throw the right
 * domain error.
 */
import {
  BulkOperationInvalidStateTransitionError,
  ImportJobInvalidStateTransitionError,
  ReportRunInvalidStateTransitionError,
} from './reporting.errors';
import {
  CANCELLABLE_BULK_OP_STATUSES,
  CANCELLABLE_IMPORT_JOB_STATUSES,
  CANCELLABLE_REPORT_RUN_STATUSES,
  COMMITTABLE_IMPORT_JOB_STATUSES,
  TERMINAL_BULK_OP_STATUSES,
  TERMINAL_IMPORT_JOB_STATUSES,
  TERMINAL_REPORT_RUN_STATUSES,
  assertBulkOperationTransition,
  assertImportJobTransition,
  assertReportRunTransition,
  canBulkOperationTransition,
  canImportJobTransition,
  canReportRunTransition,
} from './state-machine';
import type {
  BulkOperationStatusValue,
  ImportJobStatusValue,
  ReportRunStatusValue,
} from './reporting.constants';

describe('Report-run state machine', () => {
  type Tx = readonly [ReportRunStatusValue, ReportRunStatusValue, boolean];
  const cases: ReadonlyArray<Tx> = [
    ['PENDING', 'RUNNING', true],
    ['PENDING', 'CANCELLED', true],
    ['PENDING', 'SUCCEEDED', false],
    ['RUNNING', 'SUCCEEDED', true],
    ['RUNNING', 'FAILED', true],
    ['RUNNING', 'CANCELLED', true],
    ['RUNNING', 'PENDING', false],
    ['SUCCEEDED', 'RUNNING', false],
    ['FAILED', 'RUNNING', false],
    ['CANCELLED', 'RUNNING', false],
  ];

  it.each(cases)('canReportRunTransition(%s -> %s) = %s', (from, to, ok) => {
    expect(canReportRunTransition(from, to)).toBe(ok);
  });

  it('terminal set is {SUCCEEDED, FAILED, CANCELLED}', () => {
    expect([...TERMINAL_REPORT_RUN_STATUSES].sort()).toEqual(
      ['CANCELLED', 'FAILED', 'SUCCEEDED'],
    );
  });

  it('cancellable set is {PENDING, RUNNING}', () => {
    expect([...CANCELLABLE_REPORT_RUN_STATUSES].sort()).toEqual([
      'PENDING',
      'RUNNING',
    ]);
  });

  it('assertReportRunTransition throws on invalid transition', () => {
    expect(() => assertReportRunTransition('id-1', 'SUCCEEDED', 'RUNNING')).toThrow(
      ReportRunInvalidStateTransitionError,
    );
  });

  it('assertReportRunTransition is silent on valid transition', () => {
    expect(() => assertReportRunTransition('id-1', 'PENDING', 'RUNNING')).not.toThrow();
  });
});

describe('Import-job state machine', () => {
  type Tx = readonly [ImportJobStatusValue, ImportJobStatusValue, boolean];
  const cases: ReadonlyArray<Tx> = [
    ['PENDING', 'VALIDATING', true],
    ['PENDING', 'CANCELLED', true],
    ['PENDING', 'COMMITTING', false],
    ['VALIDATING', 'VALIDATED', true],
    ['VALIDATING', 'FAILED', true],
    ['VALIDATING', 'CANCELLED', true],
    ['VALIDATED', 'COMMITTING', true],
    ['VALIDATED', 'CANCELLED', true],
    ['VALIDATED', 'FAILED', false],
    ['COMMITTING', 'COMMITTED', true],
    ['COMMITTING', 'FAILED', true],
    ['COMMITTING', 'CANCELLED', false],
    ['COMMITTED', 'VALIDATING', false],
    ['FAILED', 'VALIDATING', false],
    ['CANCELLED', 'VALIDATING', false],
  ];

  it.each(cases)('canImportJobTransition(%s -> %s) = %s', (from, to, ok) => {
    expect(canImportJobTransition(from, to)).toBe(ok);
  });

  it('terminal set is {COMMITTED, FAILED, CANCELLED}', () => {
    expect([...TERMINAL_IMPORT_JOB_STATUSES].sort()).toEqual(
      ['CANCELLED', 'COMMITTED', 'FAILED'],
    );
  });

  it('cancellable set is {PENDING, VALIDATING, VALIDATED}', () => {
    expect([...CANCELLABLE_IMPORT_JOB_STATUSES].sort()).toEqual([
      'PENDING',
      'VALIDATED',
      'VALIDATING',
    ]);
  });

  it('committable set is {VALIDATED}', () => {
    expect([...COMMITTABLE_IMPORT_JOB_STATUSES]).toEqual(['VALIDATED']);
  });

  it('assertImportJobTransition throws on invalid transition', () => {
    expect(() =>
      assertImportJobTransition('id-1', 'COMMITTED', 'VALIDATING'),
    ).toThrow(ImportJobInvalidStateTransitionError);
  });
});

describe('Bulk-operation state machine', () => {
  type Tx = readonly [
    BulkOperationStatusValue,
    BulkOperationStatusValue,
    boolean,
  ];
  const cases: ReadonlyArray<Tx> = [
    ['DRAFT', 'PREVIEWED', true],
    ['DRAFT', 'VALIDATED', true],
    ['DRAFT', 'EXECUTING', true],
    ['DRAFT', 'CANCELLED', true],
    ['DRAFT', 'COMPLETED', false],
    ['PREVIEWED', 'EXECUTING', true],
    ['PREVIEWED', 'CANCELLED', true],
    ['PREVIEWED', 'COMPLETED', false],
    ['VALIDATED', 'EXECUTING', true],
    ['VALIDATED', 'CANCELLED', true],
    ['EXECUTING', 'COMPLETED', true],
    ['EXECUTING', 'FAILED', true],
    ['EXECUTING', 'CANCELLED', false],
    ['COMPLETED', 'EXECUTING', false],
    ['FAILED', 'EXECUTING', false],
    ['CANCELLED', 'EXECUTING', false],
  ];

  it.each(cases)('canBulkOperationTransition(%s -> %s) = %s', (from, to, ok) => {
    expect(canBulkOperationTransition(from, to)).toBe(ok);
  });

  it('terminal set is {COMPLETED, FAILED, CANCELLED}', () => {
    expect([...TERMINAL_BULK_OP_STATUSES].sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'FAILED'],
    );
  });

  it('cancellable set is {DRAFT, PREVIEWED, VALIDATED}', () => {
    expect([...CANCELLABLE_BULK_OP_STATUSES].sort()).toEqual([
      'DRAFT',
      'PREVIEWED',
      'VALIDATED',
    ]);
  });

  it('assertBulkOperationTransition throws on invalid transition', () => {
    expect(() =>
      assertBulkOperationTransition('id-1', 'COMPLETED', 'EXECUTING'),
    ).toThrow(BulkOperationInvalidStateTransitionError);
  });
});
