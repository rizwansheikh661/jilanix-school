import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { StudentService } from '../../student/student/student.service';
import type { StudentRow, StudentStatusValue } from '../../student/student.types';
import {
  MAX_REPORT_ROWS,
  type ReportKindValue,
} from '../reporting.constants';
import type { ReportColumn, ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import type {
  ReportEngine,
  ReportEngineContext,
} from './report-engine.types';

const COLUMNS: readonly ReportColumn[] = Object.freeze([
  { key: 'admissionNo', header: 'Admission No' },
  { key: 'firstName', header: 'First Name' },
  { key: 'lastName', header: 'Last Name' },
  { key: 'classId', header: 'Class' },
  { key: 'sectionId', header: 'Section' },
  { key: 'gender', header: 'Gender' },
  { key: 'dateOfBirth', header: 'Date of Birth' },
  { key: 'status', header: 'Status' },
]);

interface StudentListParams {
  readonly academicYearId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly status?: StudentStatusValue;
  readonly limit?: number;
}

@Injectable()
export class StudentListEngine implements ReportEngine, OnApplicationBootstrap {
  public readonly kind: ReportKindValue = 'STUDENT_LIST';

  constructor(
    private readonly registry: ReportEngineRegistry,
    private readonly students: StudentService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  public async execute(
    params: Record<string, unknown>,
    _ctx: ReportEngineContext,
  ): Promise<ReportRowSet> {
    const parsed = normalizeParams(params);
    const cap = Math.min(parsed.limit ?? MAX_REPORT_ROWS, MAX_REPORT_ROWS);

    const rows: Record<string, unknown>[] = [];
    let cursorId: string | undefined;
    const pageSize = 200;
    while (rows.length < cap) {
      const page = await this.students.list({
        limit: pageSize,
        ...(cursorId !== undefined ? { cursorId } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
        ...(parsed.academicYearId !== undefined
          ? { academicYearId: parsed.academicYearId }
          : {}),
        ...(parsed.classId !== undefined ? { classId: parsed.classId } : {}),
        ...(parsed.sectionId !== undefined ? { sectionId: parsed.sectionId } : {}),
      });
      for (const item of page.items) {
        rows.push(toRow(item));
        if (rows.length >= cap) break;
      }
      if (page.nextCursorId === null || page.items.length === 0) break;
      cursorId = page.nextCursorId;
    }

    return { columns: COLUMNS, rows };
  }
}

function normalizeParams(params: Record<string, unknown>): StudentListParams {
  const out: { -readonly [K in keyof StudentListParams]: StudentListParams[K] } = {};
  if (typeof params.academicYearId === 'string') {
    out.academicYearId = params.academicYearId;
  }
  if (typeof params.classId === 'string') out.classId = params.classId;
  if (typeof params.sectionId === 'string') out.sectionId = params.sectionId;
  if (typeof params.status === 'string') {
    out.status = params.status as StudentStatusValue;
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    out.limit = Math.max(1, Math.floor(params.limit));
  }
  return out;
}

function toRow(s: StudentRow): Record<string, unknown> {
  return {
    admissionNo: s.admissionNo,
    firstName: s.firstName,
    lastName: s.lastName,
    classId: s.classId,
    sectionId: s.sectionId,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth.toISOString().slice(0, 10),
    status: s.status,
  };
}
