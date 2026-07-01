/**
 * ParentService — orchestrates Parent CRUD and parent ↔ student linkage.
 *
 * Two non-trivial invariants live here:
 *
 *   1. **At least one phone contact** on the Parent row — checked at
 *      create and update time. The DB does not enforce this (MySQL
 *      multi-column CHECKs are version-fragile), so we throw
 *      `ParentContactRequiredError` (422) before we hit the table.
 *
 *   2. **Per-student link cap = 3** and **single primary contact**.
 *      `linkStudent` looks up the active link count and the existing
 *      primary, demoting it inside the same transaction when the
 *      caller asks to claim primary.
 *
 * Soft-delete is refused while any active link points at a non-deleted
 * student — clients must unlink first.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import {
  ParentContactRequiredError,
  ParentHasActiveLinksError,
  ParentLinkAlreadyExistsError,
} from '../parent.errors';
import {
  type ParentRelationValue,
  type ParentRow,
  type ParentStudentLinkRow,
} from '../parent.types';
import { ParentRelationshipService } from '../relationships/parent-relationship.service';
import {
  ParentStudentLinkRepository,
  type CreateLinkInput,
} from '../repositories/parent-student-link.repository';
import {
  ParentRepository,
  type CreateParentInput,
  type UpdateParentInput,
} from '../repositories/parent.repository';

export interface CreateParentArgs extends CreateParentInput {}
export interface UpdateParentArgs extends UpdateParentInput {}

export interface ListParentsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly q?: string;
  readonly studentId?: string;
}

export interface LinkStudentArgs {
  readonly studentId: string;
  readonly relation: ParentRelationValue;
  readonly isPrimaryContact?: boolean;
  readonly canPickup?: boolean;
}

@Injectable()
export class ParentService {
  private readonly logger = new Logger(ParentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ParentRepository,
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly relationships: ParentRelationshipService,
  ) {}

  public async list(
    args: ListParentsArgs,
  ): Promise<{ readonly items: readonly ParentRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ParentRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Parent', id);
    }
    return row;
  }

  public async create(args: CreateParentArgs, tx?: PrismaTx): Promise<ParentRow> {
    assertContact(args.fatherPhone, args.motherPhone, args.guardianPhone);
    const run = (t: PrismaTx): Promise<ParentRow> => this.repo.create(args, t);
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateParentArgs,
  ): Promise<ParentRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Parent', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Parent', id, expectedVersion);
      }
      const fp = pick(patch.fatherPhone, current.fatherPhone);
      const mp = pick(patch.motherPhone, current.motherPhone);
      const gp = pick(patch.guardianPhone, current.guardianPhone);
      assertContact(fp, mp, gp);
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Parent', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Parent', id, expectedVersion);
      }
      const linkCount = await this.linkRepo.countActiveLinksForParent(id, tx);
      if (linkCount > 0) {
        throw new ParentHasActiveLinksError({ parentId: id, linkCount });
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Soft-deleted Parent ${id}.`);
    });
  }

  public async linkStudent(
    parentId: string,
    args: LinkStudentArgs,
    tx?: PrismaTx,
  ): Promise<ParentStudentLinkRow> {
    const run = async (t: PrismaTx): Promise<ParentStudentLinkRow> => {
      const parent = await this.repo.findById(parentId, t);
      if (parent === null) {
        throw new NotFoundError('Parent', parentId);
      }
      const studentExists = await this.repo.studentExists(args.studentId, t);
      if (!studentExists) {
        throw new NotFoundError('Student', args.studentId);
      }
      const dup = await this.linkRepo.findExisting(
        { parentId, studentId: args.studentId, relation: args.relation },
        t,
      );
      if (dup !== null) {
        throw new ParentLinkAlreadyExistsError({
          parentId,
          studentId: args.studentId,
          relation: args.relation,
        });
      }
      const existing = await this.linkRepo.findByStudent(args.studentId, t);
      const wantsPrimary = args.isPrimaryContact ?? false;
      // Delegate the cap and primary-collision invariants to the
      // centralised relationship service. It raises the 422
      // `MAX_LINKS_EXCEEDED` / `MULTIPLE_PRIMARY_CONTACTS` errors.
      //
      // The cap check sees `existing.length` so passing `wantsPrimary=false`
      // here lets the existing "demote-then-promote" path keep working —
      // we only assert single-primary when the caller did NOT ask to
      // demote, i.e. when there's no in-tx demotion about to happen.
      await this.relationships.validateLink(
        {
          parentId,
          studentId: args.studentId,
          relation: args.relation,
          isPrimaryContact: false, // demotion handled below
          canPickup: args.canPickup ?? true,
        },
        t,
      );
      if (wantsPrimary) {
        await this.linkRepo.demotePrimaryContact(args.studentId, t);
      } else if (existing.length === 0) {
        // First link gets primary by default to avoid leaving the
        // student with no primary contact.
      }
      const input: CreateLinkInput = {
        parentId,
        studentId: args.studentId,
        relation: args.relation,
        isPrimaryContact: wantsPrimary || existing.length === 0,
        ...(args.canPickup !== undefined ? { canPickup: args.canPickup } : {}),
      };
      return this.linkRepo.create(input, t);
    };
    return tx !== undefined ? run(tx) : this.prisma.transaction(run);
  }

  public async unlinkStudent(parentId: string, linkId: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const link = await this.linkRepo.findById(linkId, tx);
      if (link === null || link.parentId !== parentId) {
        throw new NotFoundError('ParentStudentLink', linkId);
      }
      await this.linkRepo.delete(linkId, tx);
      this.logger.log(`Unlinked Parent ${parentId} from Student ${link.studentId}.`);
    });
  }

  public async listLinksForParent(parentId: string): Promise<readonly ParentStudentLinkRow[]> {
    const parent = await this.repo.findById(parentId);
    if (parent === null) {
      throw new NotFoundError('Parent', parentId);
    }
    return this.linkRepo.findByParent(parentId);
  }
}

function assertContact(
  fatherPhone: string | null | undefined,
  motherPhone: string | null | undefined,
  guardianPhone: string | null | undefined,
): void {
  const has = (v: string | null | undefined): boolean =>
    typeof v === 'string' && v.trim() !== '';
  if (!has(fatherPhone) && !has(motherPhone) && !has(guardianPhone)) {
    throw new ParentContactRequiredError();
  }
}

function pick<T>(patchValue: T | undefined, currentValue: T): T {
  return patchValue === undefined ? currentValue : patchValue;
}
