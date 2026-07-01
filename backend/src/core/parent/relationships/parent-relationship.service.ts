/**
 * ParentRelationshipService — Sprint 17 extraction.
 *
 * Centralises the Parent ↔ Student relationship invariants formerly
 * scattered inside `ParentService.linkStudent`. Both the existing
 * `link/unlink` controller paths and the upcoming portal-side flows
 * (Sprint 17 `/me/*`) call into this service so the rules stay in one
 * place.
 *
 * Invariants enforced (per `BUSINESS_RULES.md` §634-§642):
 *   - Single primary contact per student — `assertSinglePrimaryContact`
 *     refuses a second link with `isPrimaryContact=true` while one is
 *     already alive.
 *   - Max parent links per student (default 3) — `assertMaxLinksPerStudent`
 *     refuses the (N+1)-th link.
 *   - At least one pickup-authorized parent — `assertAtLeastOnePickupAuthorized`
 *     refuses an unlink/demotion that would leave the student with no
 *     `canPickup=true` link.
 *   - At least one emergency contact — `assertAtLeastOneEmergencyContact`
 *     refuses an unlink that would leave the student with no
 *     `isPrimaryContact=true` link.
 *
 * The four `assert*` methods throw the dedicated `ValidationFailedError`
 * subclasses from `parent.errors.ts` so the global filter renders them as
 * 422 with stable codes the client can switch on.
 *
 * Read-side helpers `listLinksForStudent` / `listLinksForParent` thinly
 * wrap the repository so callers (e.g. the `/me/students` projection)
 * don't import the repo directly.
 */
import { Injectable } from '@nestjs/common';

import type { PrismaTx } from '../../../infra/prisma/types';
import {
  MaxLinksExceededError,
  MultiplePrimaryContactsError,
  NoEmergencyContactError,
  NoPickupAuthorizedError,
} from '../parent.errors';
import {
  PARENT_LINKS_PER_STUDENT_LIMIT,
  type ParentRelationValue,
  type ParentStudentLinkRow,
} from '../parent.types';
import { ParentStudentLinkRepository } from '../repositories/parent-student-link.repository';

export interface ValidateLinkInput {
  readonly studentId: string;
  readonly parentId: string;
  readonly relation: ParentRelationValue;
  readonly isPrimaryContact: boolean;
  readonly canPickup: boolean;
  /**
   * Per-student cap override. Defaults to PARENT_LINKS_PER_STUDENT_LIMIT.
   */
  readonly maxLinks?: number;
}

export interface ValidateUnlinkInput {
  readonly linkId: string;
  readonly studentId: string;
}

@Injectable()
export class ParentRelationshipService {
  constructor(private readonly linkRepo: ParentStudentLinkRepository) {}

  // ------------------------------------------------------------------------
  // Composite pre-write checks
  // ------------------------------------------------------------------------

  /**
   * Run every relevant pre-write check before a new ParentStudentLink is
   * created. Caller still performs the write; this method only throws on
   * invariant violations.
   */
  public async validateLink(input: ValidateLinkInput, tx?: PrismaTx): Promise<void> {
    const limit = input.maxLinks ?? PARENT_LINKS_PER_STUDENT_LIMIT;
    await this.assertMaxLinksPerStudent(input.studentId, tx, limit);
    if (input.isPrimaryContact) {
      await this.assertSinglePrimaryContact(input.studentId, tx);
    }
  }

  /**
   * Run every relevant pre-unlink check before a ParentStudentLink is
   * removed. Caller still performs the delete; this method only throws on
   * invariant violations.
   *
   * Both pickup and emergency-contact invariants are evaluated by
   * simulating the unlink against the current alive set.
   */
  public async validateUnlink(input: ValidateUnlinkInput, tx?: PrismaTx): Promise<void> {
    const all = await this.linkRepo.findByStudent(input.studentId, tx);
    const target = all.find((l) => l.id === input.linkId);
    if (target === undefined) {
      // The unlink target does not exist — leave the not-found surface to
      // the caller. We have nothing to validate.
      return;
    }
    const remaining = all.filter((l) => l.id !== input.linkId);
    if (target.canPickup && !remaining.some((l) => l.canPickup)) {
      throw new NoPickupAuthorizedError(input.studentId);
    }
    if (target.isPrimaryContact && !remaining.some((l) => l.isPrimaryContact)) {
      throw new NoEmergencyContactError(input.studentId);
    }
  }

  // ------------------------------------------------------------------------
  // Atomic assertions — exposed so callers can compose custom flows.
  // ------------------------------------------------------------------------

  /**
   * Throw `MultiplePrimaryContactsError` (422) if the student already has a
   * link with `isPrimaryContact=true`. Caller is expected to demote the
   * existing primary first when the user genuinely wants to swap.
   */
  public async assertSinglePrimaryContact(studentId: string, tx?: PrismaTx): Promise<void> {
    const links = await this.linkRepo.findByStudent(studentId, tx);
    if (links.some((l) => l.isPrimaryContact)) {
      throw new MultiplePrimaryContactsError(studentId);
    }
  }

  /**
   * Throw `MaxLinksExceededError` (422) if the student already has the cap's
   * worth of alive parent links.
   */
  public async assertMaxLinksPerStudent(
    studentId: string,
    tx?: PrismaTx,
    max: number = PARENT_LINKS_PER_STUDENT_LIMIT,
  ): Promise<void> {
    const links = await this.linkRepo.findByStudent(studentId, tx);
    if (links.length >= max) {
      throw new MaxLinksExceededError(studentId, max);
    }
  }

  /**
   * Throw `NoPickupAuthorizedError` (422) if the student would be left with
   * no pickup-authorized link after a pending modification. Pass the
   * `excludingLinkId` to simulate an unlink, or omit it to check the
   * current state straight up.
   */
  public async assertAtLeastOnePickupAuthorized(
    studentId: string,
    tx?: PrismaTx,
    excludingLinkId?: string,
  ): Promise<void> {
    const links = await this.linkRepo.findByStudent(studentId, tx);
    const remaining = excludingLinkId === undefined
      ? links
      : links.filter((l) => l.id !== excludingLinkId);
    if (!remaining.some((l) => l.canPickup)) {
      throw new NoPickupAuthorizedError(studentId);
    }
  }

  /**
   * Throw `NoEmergencyContactError` (422) if the student would be left with
   * no emergency-contact (primary) link after a pending modification.
   */
  public async assertAtLeastOneEmergencyContact(
    studentId: string,
    tx?: PrismaTx,
    excludingLinkId?: string,
  ): Promise<void> {
    const links = await this.linkRepo.findByStudent(studentId, tx);
    const remaining = excludingLinkId === undefined
      ? links
      : links.filter((l) => l.id !== excludingLinkId);
    if (!remaining.some((l) => l.isPrimaryContact)) {
      throw new NoEmergencyContactError(studentId);
    }
  }

  // ------------------------------------------------------------------------
  // Read-side helpers
  // ------------------------------------------------------------------------

  public async listLinksForStudent(
    studentId: string,
    tx?: PrismaTx,
  ): Promise<readonly ParentStudentLinkRow[]> {
    return this.linkRepo.findByStudent(studentId, tx);
  }

  public async listLinksForParent(
    parentId: string,
    tx?: PrismaTx,
  ): Promise<readonly ParentStudentLinkRow[]> {
    return this.linkRepo.findByParent(parentId, tx);
  }
}
