/**
 * SubjectService — CRUD for `Subject`. Validates code uniqueness up-front
 * so duplicate creates surface as `SubjectCodeTakenError` rather than the
 * generic `DuplicateResourceError` from the Prisma error mapper. The DB
 * unique index is still authoritative on race conditions.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, VersionConflict } from '../../errors/domain-error';
import { SubjectCodeTakenError } from '../academic.errors';
import type { SubjectRow, SubjectTypeValue } from '../academic.types';
import { SubjectRepository } from '../repositories/subject.repository';

export interface CreateSubjectArgs {
  readonly name: string;
  readonly code: string;
  readonly type: SubjectTypeValue;
}

export interface UpdateSubjectArgs {
  readonly name?: string;
  readonly code?: string;
  readonly type?: SubjectTypeValue;
}

@Injectable()
export class SubjectService {
  private readonly logger = new Logger(SubjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SubjectRepository,
  ) {}

  public async list(args: {
    readonly limit: number;
    readonly cursorId?: string;
    readonly type?: SubjectTypeValue;
  }): Promise<{ readonly items: readonly SubjectRow[]; readonly nextCursorId: string | null }> {
    const { rows, nextCursorId } = await this.repo.findMany(args);
    return { items: rows, nextCursorId };
  }

  public async getById(id: string): Promise<SubjectRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('Subject', id);
    }
    return row;
  }

  public async create(args: CreateSubjectArgs): Promise<SubjectRow> {
    return this.prisma.transaction(async (tx) => {
      const existing = await this.repo.findByCode(args.code, tx);
      if (existing !== null) {
        throw new SubjectCodeTakenError(args.code);
      }
      return this.repo.create(args, tx);
    });
  }

  public async update(
    id: string,
    expectedVersion: number,
    patch: UpdateSubjectArgs,
  ): Promise<SubjectRow> {
    return this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Subject', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Subject', id, expectedVersion);
      }
      if (patch.code !== undefined && patch.code !== current.code) {
        const clash = await this.repo.findByCode(patch.code, tx);
        if (clash !== null && clash.id !== id) {
          throw new SubjectCodeTakenError(patch.code);
        }
      }
      return this.repo.update(id, expectedVersion, patch, tx);
    });
  }

  public async softDelete(id: string, expectedVersion: number): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const current = await this.repo.findById(id, tx);
      if (current === null) {
        throw new NotFoundError('Subject', id);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflict('Subject', id, expectedVersion);
      }
      await this.repo.softDelete(id, expectedVersion, tx);
      this.logger.log(`Soft-deleted Subject ${id}.`);
    });
  }
}
