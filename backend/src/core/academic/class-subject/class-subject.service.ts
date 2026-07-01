/**
 * ClassSubjectService — manages the default subject offerings for a class.
 * Public surface is intentionally narrow: list and replace-set. There is no
 * individual create/update/delete — the controller exposes only PUT so the
 * caller sees a single idempotent state-change verb.
 *
 * Validation: every requested `subjectId` must point to an existing,
 * non-deleted subject in the same school. The unique `(schoolId, classId,
 * subjectId)` index plus the in-transaction `replaceForClass` guarantee no
 * duplicates land in the table.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError, ValidationFailedError } from '../../errors/domain-error';
import type { ClassSubjectRow } from '../academic.types';
import { ClassRepository } from '../repositories/class.repository';
import {
  ClassSubjectRepository,
  type ClassSubjectInput,
} from '../repositories/class-subject.repository';
import { SubjectRepository } from '../repositories/subject.repository';

export interface SetClassSubjectsArgs {
  readonly classId: string;
  readonly subjects: readonly ClassSubjectInput[];
}

@Injectable()
export class ClassSubjectService {
  private readonly logger = new Logger(ClassSubjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ClassSubjectRepository,
    private readonly classRepo: ClassRepository,
    private readonly subjectRepo: SubjectRepository,
  ) {}

  public async list(classId: string): Promise<readonly ClassSubjectRow[]> {
    const cls = await this.classRepo.findById(classId);
    if (cls === null) {
      throw new NotFoundError('Class', classId);
    }
    return this.repo.findAllForClass(classId);
  }

  public async setForClass(args: SetClassSubjectsArgs): Promise<readonly ClassSubjectRow[]> {
    this.assertNoDuplicateSubjects(args.subjects);
    return this.prisma.transaction(async (tx) => {
      const cls = await this.classRepo.findById(args.classId, tx);
      if (cls === null) {
        throw new NotFoundError('Class', args.classId);
      }
      await this.assertAllSubjectsExist(args.subjects, tx);
      const result = await this.repo.replaceForClass(args.classId, args.subjects, tx);
      this.logger.log(
        `Replaced class-subject set for Class ${args.classId}: ${result.length} subjects.`,
      );
      return result;
    });
  }

  private assertNoDuplicateSubjects(subjects: readonly ClassSubjectInput[]): void {
    const seen = new Set<string>();
    for (const s of subjects) {
      if (seen.has(s.subjectId)) {
        throw new ValidationFailedError(
          [
            {
              path: 'subjects',
              code: 'DUPLICATE_SUBJECT',
              message: `Subject ${s.subjectId} appears more than once in the input.`,
            },
          ],
          'Duplicate subjectId in input list',
        );
      }
      seen.add(s.subjectId);
    }
  }

  private async assertAllSubjectsExist(
    subjects: readonly ClassSubjectInput[],
    tx: import('../../../infra/prisma/types').PrismaTx,
  ): Promise<void> {
    for (const s of subjects) {
      const subject = await this.subjectRepo.findById(s.subjectId, tx);
      if (subject === null) {
        throw new NotFoundError('Subject', s.subjectId);
      }
    }
  }
}
