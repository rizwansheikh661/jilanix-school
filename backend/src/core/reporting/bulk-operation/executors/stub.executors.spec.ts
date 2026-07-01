/**
 * Stub bulk-operation executor specs — all 6 throw NotImplemented on every mode.
 */
import { BulkOperationKindNotImplementedError } from '../../reporting.errors';
import { BulkOperationExecutorRegistry } from './executor.registry';
import {
  AssignmentCloseExecutor,
  FeeWaiveExecutor,
  HomeworkCloseExecutor,
  StaffDeactivateExecutor,
  StudentDeactivateExecutor,
  StudentTransferSectionExecutor,
} from './stub.executors';

const CTX = {
  schoolId: 'school-1',
  userId: 'user-1',
  bulkOperationId: 'bop-1',
};

const cases: ReadonlyArray<[string, () => unknown]> = [
  ['StudentTransferSectionExecutor', () => new StudentTransferSectionExecutor(new BulkOperationExecutorRegistry())],
  ['StudentDeactivateExecutor', () => new StudentDeactivateExecutor(new BulkOperationExecutorRegistry())],
  ['StaffDeactivateExecutor', () => new StaffDeactivateExecutor(new BulkOperationExecutorRegistry())],
  ['FeeWaiveExecutor', () => new FeeWaiveExecutor(new BulkOperationExecutorRegistry())],
  ['HomeworkCloseExecutor', () => new HomeworkCloseExecutor(new BulkOperationExecutorRegistry())],
  ['AssignmentCloseExecutor', () => new AssignmentCloseExecutor(new BulkOperationExecutorRegistry())],
];

describe('stub bulk-operation executors', () => {
  it.each(cases)('%s.preview throws NotImplemented', async (_, build) => {
    const e = build() as {
      preview: (p: Record<string, unknown>, c: typeof CTX) => Promise<unknown>;
    };
    await expect(e.preview({}, CTX)).rejects.toBeInstanceOf(
      BulkOperationKindNotImplementedError,
    );
  });

  it.each(cases)('%s.validate throws NotImplemented', async (_, build) => {
    const e = build() as {
      validate: (p: Record<string, unknown>, c: typeof CTX) => Promise<unknown>;
    };
    await expect(e.validate({}, CTX)).rejects.toBeInstanceOf(
      BulkOperationKindNotImplementedError,
    );
  });

  it.each(cases)('%s.execute throws NotImplemented', async (_, build) => {
    const e = build() as {
      execute: (p: Record<string, unknown>, c: typeof CTX) => Promise<unknown>;
    };
    await expect(e.execute({}, CTX)).rejects.toBeInstanceOf(
      BulkOperationKindNotImplementedError,
    );
  });
});
