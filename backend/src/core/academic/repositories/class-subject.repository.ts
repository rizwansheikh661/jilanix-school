/**
 * ClassSubjectRepository — read/write access to `class_subjects`.
 *
 * No soft-delete (replace-not-mutate model). The service uses
 * `replaceForClass` to atomically rewrite the set for a class — the
 * controller exposes only PUT, never POST/DELETE on individual rows.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ClassSubjectRow } from '../academic.types';

export interface ClassSubjectInput {
  readonly subjectId: string;
  readonly isOptional?: boolean;
  readonly weeklyPeriods?: number | null;
}

@Injectable()
export class ClassSubjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findAllForClass(
    classId: string,
    tx?: PrismaTx,
  ): Promise<readonly ClassSubjectRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.classSubject.findMany({
      where: { schoolId, classId },
      orderBy: [{ subjectId: 'asc' }],
    });
    return rows.map(mapRow);
  }

  /**
   * Idempotent set replacement: drop rows whose subjectId is no longer in the
   * input, upsert the rest. Caller MUST supply a transaction so the entire
   * swap commits atomically.
   */
  public async replaceForClass(
    classId: string,
    inputs: readonly ClassSubjectInput[],
    tx: PrismaTx,
  ): Promise<readonly ClassSubjectRow[]> {
    const { schoolId } = this.tenantContext();
    const keepSubjectIds = inputs.map((i) => i.subjectId);

    // Delete rows whose subjects fell out of the set.
    await tx.classSubject.deleteMany({
      where: {
        schoolId,
        classId,
        ...(keepSubjectIds.length > 0 ? { NOT: { subjectId: { in: keepSubjectIds } } } : {}),
      },
    });

    // Upsert each desired row (cheap one-by-one — class default lists are tiny).
    for (const input of inputs) {
      await tx.classSubject.upsert({
        where: {
          schoolId_classId_subjectId: {
            schoolId,
            classId,
            subjectId: input.subjectId,
          },
        },
        create: {
          schoolId,
          classId,
          subjectId: input.subjectId,
          isOptional: input.isOptional ?? false,
          weeklyPeriods: input.weeklyPeriods ?? null,
        },
        update: {
          isOptional: input.isOptional ?? false,
          weeklyPeriods: input.weeklyPeriods ?? null,
          version: { increment: 1 },
        },
      });
    }

    return this.findAllForClass(classId, tx);
  }

  /** Subject-ids currently registered as defaults for a class. */
  public async listSubjectIdsForClass(
    classId: string,
    tx?: PrismaTx,
  ): Promise<readonly string[]> {
    const rows = await this.findAllForClass(classId, tx);
    return rows.map((r) => r.subjectId);
  }

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ClassSubjectRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  isOptional: boolean;
  weeklyPeriods: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): ClassSubjectRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    classId: row.classId,
    subjectId: row.subjectId,
    isOptional: row.isOptional,
    weeklyPeriods: row.weeklyPeriods,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
