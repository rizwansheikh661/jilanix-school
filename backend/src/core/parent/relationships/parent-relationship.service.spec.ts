/**
 * ParentRelationshipService unit specs — Sprint 17 Wave 8.
 *
 * Covers the three Sprint 17 plan §9 assertions:
 *   1. `validateLink()` rejects a 2nd primary-contact link with the
 *      `MULTIPLE_PRIMARY_CONTACTS` validation code.
 *   2. `validateLink()`/`assertMaxLinksPerStudent()` caps links per
 *      student at the canonical limit (3) — the 4th throws
 *      `MAX_LINKS_EXCEEDED`.
 *   3. `assertAtLeastOnePickupAuthorized()` blocks an unlink that would
 *      zero the pickup-authorized list for that student.
 */
import {
  MaxLinksExceededError,
  MultiplePrimaryContactsError,
  NoPickupAuthorizedError,
} from '../parent.errors';
import type { ParentStudentLinkRow } from '../parent.types';
import type { ParentStudentLinkRepository } from '../repositories/parent-student-link.repository';
import { ParentRelationshipService } from './parent-relationship.service';

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K];
};

function makeLink(overrides: Partial<ParentStudentLinkRow> = {}): ParentStudentLinkRow {
  return {
    id: 'l-1',
    schoolId: 'school-1',
    parentId: 'p-1',
    studentId: 's-1',
    relation: 'FATHER',
    isPrimaryContact: false,
    canPickup: true,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    createdBy: null,
    ...overrides,
  };
}

function makeService() {
  const linkRepo: Mocked<ParentStudentLinkRepository> = {
    findById: jest.fn(),
    findExisting: jest.fn(),
    findByStudent: jest.fn(),
    findByParent: jest.fn(),
    countActiveLinksForParent: jest.fn(),
    create: jest.fn(),
    demotePrimaryContact: jest.fn(),
    delete: jest.fn(),
  } as unknown as Mocked<ParentStudentLinkRepository>;
  const svc = new ParentRelationshipService(linkRepo as never);
  return { svc, linkRepo };
}

describe('ParentRelationshipService.validateLink', () => {
  it('rejects a 2nd primary-contact link with MULTIPLE_PRIMARY_CONTACTS', async () => {
    const { svc, linkRepo } = makeService();
    linkRepo.findByStudent.mockResolvedValue([
      makeLink({ id: 'existing', isPrimaryContact: true }),
    ]);
    let thrown: unknown;
    try {
      await svc.validateLink({
        studentId: 's-1',
        parentId: 'p-2',
        relation: 'MOTHER',
        isPrimaryContact: true,
        canPickup: true,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MultiplePrimaryContactsError);
    const fields = (thrown as MultiplePrimaryContactsError).fields;
    expect(fields[0]?.code).toBe('MULTIPLE_PRIMARY_CONTACTS');
  });

  it('caps links per student at 3 — the 4th throws MAX_LINKS_EXCEEDED', async () => {
    const { svc, linkRepo } = makeService();
    linkRepo.findByStudent.mockResolvedValue([
      makeLink({ id: 'l1', relation: 'FATHER' }),
      makeLink({ id: 'l2', relation: 'MOTHER' }),
      makeLink({ id: 'l3', relation: 'GUARDIAN' }),
    ]);
    let thrown: unknown;
    try {
      await svc.validateLink({
        studentId: 's-1',
        parentId: 'p-4',
        relation: 'GRANDPARENT',
        isPrimaryContact: false,
        canPickup: true,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MaxLinksExceededError);
    const fields = (thrown as MaxLinksExceededError).fields;
    expect(fields[0]?.code).toBe('MAX_LINKS_EXCEEDED');
  });
});

describe('ParentRelationshipService.assertAtLeastOnePickupAuthorized', () => {
  it('blocks unlink that would zero the pickup-authorized list', async () => {
    const { svc, linkRepo } = makeService();
    // Two links total; only one has canPickup=true. Excluding it should
    // leave the student with zero pickup-authorized parents.
    linkRepo.findByStudent.mockResolvedValue([
      makeLink({ id: 'pickup', canPickup: true }),
      makeLink({ id: 'no-pickup', canPickup: false }),
    ]);
    await expect(
      svc.assertAtLeastOnePickupAuthorized('s-1', undefined, 'pickup'),
    ).rejects.toBeInstanceOf(NoPickupAuthorizedError);
  });

  it('allows unlink when another pickup-authorized link remains', async () => {
    const { svc, linkRepo } = makeService();
    linkRepo.findByStudent.mockResolvedValue([
      makeLink({ id: 'pickup-1', canPickup: true }),
      makeLink({ id: 'pickup-2', canPickup: true }),
    ]);
    await expect(
      svc.assertAtLeastOnePickupAuthorized('s-1', undefined, 'pickup-1'),
    ).resolves.toBeUndefined();
  });
});
