/**
 * SectionSubjectService — manages section-level subject overrides.
 *
 * Each override is one of ADD / REMOVE / REPLACE relative to the parent
 * Class's default subject set (`class_subjects`). The service also resolves
 * the *effective* set for a section:
 *   effective = (ClassDefaults ∪ ADDs) − REMOVEs, with REPLACE swapping
 *               the `replacesSubjectId` row for the new `subjectId`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import {
  SectionSubjectReplacesNotInClassError,
  SectionSubjectReplacesRequiredError,
  SectionSubjectReplacesUnexpectedError,
} from '../academic.errors';
import type { SectionSubjectMode, SectionSubjectRow } from '../academic.types';
import { ClassSubjectRepository } from '../repositories/class-subject.repository';
import { SectionRepository } from '../repositories/section.repository';
import { SectionSubjectRepository } from '../repositories/section-subject.repository';
import { SubjectRepository } from '../repositories/subject.repository';

export interface CreateSectionSubjectArgs {
  readonly sectionId: string;
  readonly subjectId: string;
  readonly mode: SectionSubjectMode;
  readonly replacesSubjectId?: string;
}

export interface EffectiveSubjectsResult {
  readonly sectionId: string;
  readonly classId: string;
  readonly subjectIds: readonly string[];
}

@Injectable()
export class SectionSubjectService {
  private readonly logger = new Logger(SectionSubjectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SectionSubjectRepository,
    private readonly sectionRepo: SectionRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly classSubjectRepo: ClassSubjectRepository,
  ) {}

  public async listOverrides(sectionId: string): Promise<readonly SectionSubjectRow[]> {
    const section = await this.sectionRepo.findById(sectionId);
    if (section === null) {
      throw new NotFoundError('Section', sectionId);
    }
    return this.repo.findAllForSection(sectionId);
  }

  /**
   * Returns the resolved subject id list for a section. The caller can use
   * this to drive timetable building, examination registration, etc.
   */
  public async listEffective(sectionId: string): Promise<EffectiveSubjectsResult> {
    const section = await this.sectionRepo.findById(sectionId);
    if (section === null) {
      throw new NotFoundError('Section', sectionId);
    }
    const [classDefaults, overrides] = await Promise.all([
      this.classSubjectRepo.listSubjectIdsForClass(section.classId),
      this.repo.findAllForSection(sectionId),
    ]);
    const effective = new Set(classDefaults);
    for (const o of overrides) {
      if (o.mode === 'ADD') {
        effective.add(o.subjectId);
      } else if (o.mode === 'REMOVE') {
        effective.delete(o.subjectId);
      } else if (o.mode === 'REPLACE' && o.replacesSubjectId !== null) {
        effective.delete(o.replacesSubjectId);
        effective.add(o.subjectId);
      }
    }
    return {
      sectionId,
      classId: section.classId,
      subjectIds: [...effective].sort(),
    };
  }

  public async create(args: CreateSectionSubjectArgs): Promise<SectionSubjectRow> {
    this.assertReplacesConsistency(args);
    return this.prisma.transaction(async (tx) => {
      const section = await this.sectionRepo.findById(args.sectionId, tx);
      if (section === null) {
        throw new NotFoundError('Section', args.sectionId);
      }
      const subject = await this.subjectRepo.findById(args.subjectId, tx);
      if (subject === null) {
        throw new NotFoundError('Subject', args.subjectId);
      }
      if (args.mode === 'REPLACE' && args.replacesSubjectId !== undefined) {
        const replaces = await this.subjectRepo.findById(args.replacesSubjectId, tx);
        if (replaces === null) {
          throw new NotFoundError('Subject', args.replacesSubjectId);
        }
        const classDefaults = await this.classSubjectRepo.listSubjectIdsForClass(
          section.classId,
          tx,
        );
        if (!classDefaults.includes(args.replacesSubjectId)) {
          throw new SectionSubjectReplacesNotInClassError(args.replacesSubjectId);
        }
      }
      const row = await this.repo.create(
        {
          sectionId: args.sectionId,
          subjectId: args.subjectId,
          mode: args.mode,
          ...(args.replacesSubjectId !== undefined
            ? { replacesSubjectId: args.replacesSubjectId }
            : {}),
        },
        tx,
      );
      this.logger.log(
        `Added ${args.mode} override for Section ${args.sectionId} subject ${args.subjectId}.`,
      );
      return row;
    });
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (row === null) {
        throw new NotFoundError('SectionSubject', id);
      }
      await this.repo.deleteById(id, tx);
      this.logger.log(`Removed SectionSubject override ${id}.`);
    });
  }

  private assertReplacesConsistency(args: CreateSectionSubjectArgs): void {
    if (args.mode === 'REPLACE' && args.replacesSubjectId === undefined) {
      throw new SectionSubjectReplacesRequiredError();
    }
    if (args.mode !== 'REPLACE' && args.replacesSubjectId !== undefined) {
      throw new SectionSubjectReplacesUnexpectedError();
    }
  }
}
