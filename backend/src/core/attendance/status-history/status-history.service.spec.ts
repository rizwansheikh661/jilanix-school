/**
 * AttendanceStatusHistoryService unit spec — thin pass-through to the
 * repository; the meaningful invariants (append-only, schoolId scope) live
 * in the global Prisma extension and the repo itself.
 */
import { AttendanceStatusHistoryService } from './status-history.service';
import { AttendanceStatusHistoryRepository } from './status-history.repository';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

describe('AttendanceStatusHistoryService.listForAttendance', () => {
  it('delegates to the repository', async () => {
    const repo: Mocked<AttendanceStatusHistoryRepository> = {
      append: jest.fn(),
      listForAttendance: jest.fn(async () => []),
    } as unknown as Mocked<AttendanceStatusHistoryRepository>;
    const svc = new AttendanceStatusHistoryService(repo as never);
    const rows = await svc.listForAttendance('att-1');
    expect(rows).toEqual([]);
    expect(repo.listForAttendance).toHaveBeenCalledWith('att-1');
  });
});
