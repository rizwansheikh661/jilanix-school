/**
 * ClassService — CRUD for `Class` (grade level). Delete is blocked while
 * any non-deleted Section still references the class — clients must remove
 * the sections first.
 *
 * Tenancy + audit columns are handled by the Prisma extension stack; this
 * service stays focused on business rules + transaction boundaries.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { ClassHasSectionsError } from '../academic.errors';
import type { ClassRow } from '../academic.types';
import { ClassRepository } from '../repositories/class.repository';

export interface CreateClassArgs {
  readonly name: string;
  readonly gradeLevel: number;
  readonly displayOrder?: number;
}

export interface UpdateClassArgs {
  readonly name?: string;
  readonly gradeLevel?: number;
  readonly displayOrder?: number;
}

@Injectable()
export class ClassService {
  private readonly logger = new Logger(ClassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ClassRepository,
  ) {}

  public async list(args: {
    readonly limit: number;
    readonly cursorId?: string;
  }): Promise<{ readonly items: readonly ClassRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<ClassRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Class', id);
    }
    return row;
  }

  public async create(args: CreateClassArgs): Promise<ClassRow> {
    return this.prisma.transaction((tx) =>
      this.repo.create(
        {
          name: args.name,
          gradeLevel: args.gradeLevel,
          ...(args.displayOrder !== undefined ? { displayOrder: args.displayOrder } : {}),
        },
        tx,
      ),
    );
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateClassArgs,
  ): Promise<ClassRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Class', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Class', id, expectedVersion);
      }
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Class', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Class', id, expectedVersion);
      }
      const sectionCount = await this.repo.countLiveSections(id, tx);
      if (sectionCount > 0) {
        throw new ClassHasSectionsError({ classId: id, sectionCount });
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Soft-deleted Class ${id}.`);
    });
  }
}
