/**
 * SectionService — CRUD for `Section` plus the dedicated assign-class-teacher
 * endpoint. Validates that the parent class exists and (when set) the
 * teacher is an active User in the tenant.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import {
  NotFoundError,
  ValidationFailedError,
  VersionConflict,
} from '../../errors/domain-error';
import { SectionTeacherNotEligibleError } from '../academic.errors';
import type { SectionRow } from '../academic.types';
import { SectionRepository } from '../repositories/section.repository';

export interface CreateSectionArgs {
  readonly classId: string;
  readonly name: string;
  readonly capacity?: number | null;
  readonly classTeacherId?: string | null;
}

export interface UpdateSectionArgs {
  readonly name?: string;
  readonly capacity?: number | null;
}

@Injectable()
export class SectionService {
  private readonly logger = new Logger(SectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SectionRepository,
  ) {}

  public async list(args: {
    readonly limit: number;
    readonly cursorId?: string;
    readonly classId?: string;
  }): Promise<{ readonly items: readonly SectionRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<SectionRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Section', id);
    }
    return row;
  }

  public async create(args: CreateSectionArgs): Promise<SectionRow> {
    this.assertCapacity(args.capacity);
    return this.prisma.transaction(async (tx) => {
      if (!(await this.repo.classExists(args.classId, tx))) {
        throw new ValidationFailedError(
          [{ path: 'classId', code: 'CLASS_NOT_FOUND', message: `Class ${args.classId} not found in this school.` }],
          'Parent class does not exist',
        );
      }
      if (args.classTeacherId !== undefined && args.classTeacherId !== null) {
        await this.assertTeacherEligible(args.classTeacherId, tx);
      }
      return this.repo.create(
        {
          classId: args.classId,
          name: args.name,
          capacity: args.capacity ?? null,
          classTeacherId: args.classTeacherId ?? null,
        },
        tx,
      );
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateSectionArgs,
  ): Promise<SectionRow> {
    this.assertCapacity(patch.capacity);
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Section', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Section', id, expectedVersion);
      }
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  /** Assign a class teacher; pass `teacherId: null` to clear. */
  public async assignClassTeacher(
    id: string,
    expectedVersion: number,
    teacherId: string | null,
  ): Promise<SectionRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Section', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Section', id, expectedVersion);
      }
      if (teacherId !== null) {
        await this.assertTeacherEligible(teacherId, tx);
      }
      const row = await this.repo.setClassTeacher(id, expectedVersion, teacherId, tx);
      this.logger.log(`Section ${id} classTeacherId set to ${teacherId ?? 'null'}.`);
      return row;
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Section', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Section', id, expectedVersion);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
    });
  }

  private async assertTeacherEligible(teacherId: string, tx: PrismaTx): Promise<void> {
    const verdict = await this.repo.classifyTeacher(teacherId, tx);
    if (verdict === 'not_found') {
      throw new SectionTeacherNotEligibleError({ teacherId, reason: 'not_found' });
    }
    if (verdict === 'inactive') {
      throw new SectionTeacherNotEligibleError({ teacherId, reason: 'inactive' });
    }
  }

  private assertCapacity(capacity: number | null | undefined): void {
    if (capacity === undefined || capacity === null) return;
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new ValidationFailedError(
        [{ path: 'capacity', code: 'CAPACITY_INVALID', message: 'capacity must be a positive integer.' }],
        'Capacity is invalid',
      );
    }
  }
}
