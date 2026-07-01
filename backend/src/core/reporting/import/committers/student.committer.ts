/**
 * StudentCommitter — writes the previously-validated student rows via
 * StudentService.create(args, tx). Each row is committed individually so a
 * single bad row (admission-no clash, placement mismatch, etc.) does not
 * roll back the rest of the batch — the outer transaction is the
 * commit-handler's, so caller decides whether to commit or rollback based
 * on the failure count.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { PrismaTx } from '../../../../infra/prisma/types';
import { StudentService, type CreateStudentArgs } from '../../../student/student/student.service';
import type { ImportKindValue } from '../../reporting.constants';
import type { ImportContext } from '../../reporting.types';
import type { ValidStudentRow } from '../../validation/student-import-row.validator';
import { RowCommitterRegistry } from './committer.registry';
import type { RowCommitter, RowCommitterResult } from './row-committer';

@Injectable()
export class StudentCommitter
  implements RowCommitter<ValidStudentRow>, OnApplicationBootstrap
{
  public readonly kind: ImportKindValue = 'STUDENT';
  private readonly logger = new Logger(StudentCommitter.name);

  constructor(
    private readonly registry: RowCommitterRegistry,
    private readonly students: StudentService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async commit(
    rows: readonly ValidStudentRow[],
    _ctx: ImportContext,
    tx: PrismaTx,
  ): Promise<RowCommitterResult> {
    const failed: { rowNumber: number; message: string }[] = [];
    let committed = 0;

    for (const row of rows) {
      try {
        const args = toCreateStudentArgs(row);
        await this.students.create(args, tx);
        committed += 1;
      } catch (err) {
        failed.push({
          rowNumber: row.rowNumber,
          message: (err as Error).message ?? 'Unknown error.',
        });
      }
    }

    this.logger.log(
      `STUDENT committer wrote=${committed} failed=${failed.length} of ${rows.length}.`,
    );
    return { committed, failed };
  }
}

function toCreateStudentArgs(row: ValidStudentRow): CreateStudentArgs {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    bloodGroup: row.bloodGroup,
    photoUrl: row.photoUrl,
    admissionNo: row.admissionNo,
    rollNo: row.rollNo,
    academicYearId: row.academicYearId,
    classId: row.classId,
    sectionId: row.sectionId,
    admittedOn: row.admittedOn,
    emergencyContacts: [],
    religion: row.religion,
    category: row.category,
    nationality: row.nationality,
    motherTongue: row.motherTongue,
    isCwsn: row.isCwsn,
    isRte: row.isRte,
    isMinority: row.isMinority,
    isBpl: row.isBpl,
    admissionType: row.admissionType,
  };
}
