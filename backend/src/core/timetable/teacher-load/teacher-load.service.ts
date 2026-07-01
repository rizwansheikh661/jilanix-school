/**
 * TeacherLoadService — read API on top of `teacher_load` cache rows.
 *
 * Recomputation happens in `TeacherLoadRecomputer`, which is invoked by
 * the entry write pipeline. This service is read-only.
 */
import { Injectable } from '@nestjs/common';

import type { TeacherLoadRow } from '../timetable.types';
import { TeacherLoadRepository } from './teacher-load.repository';

@Injectable()
export class TeacherLoadService {
  constructor(private readonly repo: TeacherLoadRepository) {}

  public async getForStaff(
    versionId: string,
    staffId: string,
  ): Promise<TeacherLoadRow | null> {
    return this.repo.findActive(versionId, staffId);
  }

  public async listForVersion(versionId: string): Promise<readonly TeacherLoadRow[]> {
    return this.repo.findAllForVersion(versionId);
  }
}
