/**
 * Sprint 4.5 — House assignment service orchestration spec.
 *
 * Real-MySQL e2e infrastructure (Testcontainers) is not yet wired in this
 * project. Until then, these specs exercise the multi-step orchestration
 * logic (re-assignment closes prior + inserts new + updates denorm pointer
 * in one tx; endAssignment clears denorm only when no other active row
 * remains) by constructing the service with mocked repositories. The
 * contract verified mirrors what a real HTTP test would assert against
 * `POST /house-assignments` and `DELETE /house-assignments/:id`.
 */
import { NotFoundError } from '../../src/core/errors/domain-error';
import { HouseAssignmentAlreadyActiveError } from '../../src/core/house/house.errors';
import { HouseAssignmentService } from '../../src/core/house/house.service';
import type {
  HouseAssignmentRepository,
  HouseRepository,
} from '../../src/core/house/repositories/house.repositories';
import type { HouseAssignmentRow, HouseRow } from '../../src/core/house/house.types';

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };

function makeHouse(overrides: Partial<HouseRow> = {}): HouseRow {
  return {
    id: 'house-red',
    schoolId: 'sch-1',
    code: 'RED',
    name: 'Red',
    colorHex: '#FF0000',
    motto: null,
    captainStudentId: null,
    viceCaptainStudentId: null,
    photoUrl: null,
    sortOrder: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<HouseAssignmentRow> = {}): HouseAssignmentRow {
  return {
    id: 'ha-1',
    schoolId: 'sch-1',
    studentId: 'stu-1',
    houseId: 'house-red',
    academicYearId: 'ay-2026',
    assignedOn: new Date('2026-04-01'),
    endedOn: null,
    reason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const repo: Mocked<HouseAssignmentRepository> = {
    findById: jest.fn(),
    findActiveForStudentYear: jest.fn(),
    listForHouse: jest.fn(),
    listForStudent: jest.fn(),
    closeAssignment: jest.fn(),
    create: jest.fn(),
    updateStudentDenormHouse: jest.fn(),
  } as unknown as Mocked<HouseAssignmentRepository>;
  const houseRepo: Mocked<HouseRepository> = {
    findById: jest.fn(),
    listAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  } as unknown as Mocked<HouseRepository>;
  const svc = new HouseAssignmentService(prisma as never, repo as never, houseRepo as never);
  return { svc, prisma, repo, houseRepo };
}

describe('Sprint 4.5 — HouseAssignmentService.assign', () => {
  it('first assignment for a (student, year) inserts and updates denorm', async () => {
    const t = makeService();
    t.houseRepo.findById.mockResolvedValue(makeHouse({ id: 'house-red' }));
    t.repo.findActiveForStudentYear.mockResolvedValue(null);
    t.repo.create.mockResolvedValue(makeAssignment());

    const row = await t.svc.assign({
      studentId: 'stu-1',
      houseId: 'house-red',
      academicYearId: 'ay-2026',
      assignedOn: new Date('2026-04-01'),
    });

    expect(t.repo.closeAssignment).not.toHaveBeenCalled();
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    expect(t.repo.updateStudentDenormHouse).toHaveBeenCalledWith(
      { studentId: 'stu-1', houseId: 'house-red' },
      expect.anything(),
    );
    expect(t.prisma.transaction).toHaveBeenCalledTimes(1);
    expect(row.houseId).toBe('house-red');
  });

  it('re-assignment closes the prior row, inserts a new one, and updates denorm in one tx', async () => {
    const t = makeService();
    t.houseRepo.findById.mockResolvedValue(makeHouse({ id: 'house-blue' }));
    t.repo.findActiveForStudentYear.mockResolvedValue(
      makeAssignment({ id: 'ha-prior', houseId: 'house-red' }),
    );
    t.repo.create.mockResolvedValue(
      makeAssignment({ id: 'ha-new', houseId: 'house-blue' }),
    );

    const newAssignedOn = new Date('2026-09-01');
    const row = await t.svc.assign({
      studentId: 'stu-1',
      houseId: 'house-blue',
      academicYearId: 'ay-2026',
      assignedOn: newAssignedOn,
    });

    expect(t.repo.closeAssignment).toHaveBeenCalledWith(
      { id: 'ha-prior', endedOn: newAssignedOn },
      expect.anything(),
    );
    expect(t.repo.create).toHaveBeenCalledTimes(1);
    expect(t.repo.updateStudentDenormHouse).toHaveBeenCalledWith(
      { studentId: 'stu-1', houseId: 'house-blue' },
      expect.anything(),
    );
    expect(t.prisma.transaction).toHaveBeenCalledTimes(1);
    expect(row.houseId).toBe('house-blue');
  });

  it('rejects re-assignment to the same house in the same year', async () => {
    const t = makeService();
    t.houseRepo.findById.mockResolvedValue(makeHouse({ id: 'house-red' }));
    t.repo.findActiveForStudentYear.mockResolvedValue(
      makeAssignment({ id: 'ha-prior', houseId: 'house-red' }),
    );

    await expect(
      t.svc.assign({
        studentId: 'stu-1',
        houseId: 'house-red',
        academicYearId: 'ay-2026',
        assignedOn: new Date('2026-09-01'),
      }),
    ).rejects.toBeInstanceOf(HouseAssignmentAlreadyActiveError);
    expect(t.repo.create).not.toHaveBeenCalled();
    expect(t.repo.updateStudentDenormHouse).not.toHaveBeenCalled();
  });

  it('NotFound when the target house is missing', async () => {
    const t = makeService();
    t.houseRepo.findById.mockResolvedValue(null);
    await expect(
      t.svc.assign({
        studentId: 'stu-1',
        houseId: 'missing',
        academicYearId: 'ay-2026',
        assignedOn: new Date(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Sprint 4.5 — HouseAssignmentService.endAssignment', () => {
  it('clears the student denorm pointer when no other active assignment remains', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment({ id: 'ha-1', endedOn: null }));
    t.repo.findActiveForStudentYear.mockResolvedValue(null);

    await t.svc.endAssignment('ha-1', new Date('2026-10-01'));

    expect(t.repo.closeAssignment).toHaveBeenCalledWith(
      { id: 'ha-1', endedOn: expect.any(Date) },
      expect.anything(),
    );
    expect(t.repo.updateStudentDenormHouse).toHaveBeenCalledWith(
      { studentId: 'stu-1', houseId: null },
      expect.anything(),
    );
  });

  it('leaves the denorm pointer when another active assignment exists', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(makeAssignment({ id: 'ha-1', endedOn: null }));
    t.repo.findActiveForStudentYear.mockResolvedValue(
      makeAssignment({ id: 'ha-other', houseId: 'house-blue' }),
    );

    await t.svc.endAssignment('ha-1', new Date('2026-10-01'));

    expect(t.repo.closeAssignment).toHaveBeenCalled();
    expect(t.repo.updateStudentDenormHouse).not.toHaveBeenCalled();
  });

  it('NotFound when assignment id is unknown', async () => {
    const t = makeService();
    t.repo.findById.mockResolvedValue(null);
    await expect(t.svc.endAssignment('missing', new Date())).rejects.toBeInstanceOf(NotFoundError);
  });
});
