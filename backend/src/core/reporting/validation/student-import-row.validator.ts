/**
 * StudentImportRowValidator — validates a raw CSV/XLSX row destined for
 * StudentService.create. Per-row checks live here; uniqueness and FK
 * existence are deferred to the commit transaction.
 */
import { Injectable } from '@nestjs/common';

import type {
  AdmissionTypeValue,
  GenderValue,
  ReligionValue,
  SocialCategoryValue,
} from '../../student/student.types';
import type {
  ImportContext,
  RowValidationIssue,
  ValidationResult,
} from '../reporting.types';
import type { RowValidator } from './row-validator';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GENDER_VALUES = new Set<GenderValue>(['MALE', 'FEMALE', 'OTHER']);

export interface RawStudentRow extends Record<string, unknown> {
  admissionNo?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  dateOfBirth?: unknown;
  gender?: unknown;
  classId?: unknown;
  sectionId?: unknown;
  academicYearId?: unknown;
  admittedOn?: unknown;
  bloodGroup?: unknown;
  religion?: unknown;
  category?: unknown;
  nationality?: unknown;
  motherTongue?: unknown;
  rollNo?: unknown;
  photoUrl?: unknown;
}

export interface ValidStudentRow {
  readonly rowNumber: number;
  readonly admissionNo: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date;
  readonly gender: GenderValue;
  readonly classId: string;
  readonly sectionId: string;
  readonly academicYearId: string;
  readonly admittedOn: Date;
  readonly bloodGroup: string | null;
  readonly religion: ReligionValue;
  readonly category: SocialCategoryValue;
  readonly nationality: string;
  readonly motherTongue: string | null;
  readonly rollNo: string | null;
  readonly photoUrl: string | null;
  readonly admissionType: AdmissionTypeValue;
  readonly isCwsn: boolean;
  readonly isRte: boolean;
  readonly isMinority: boolean;
  readonly isBpl: boolean;
}

@Injectable()
export class StudentImportRowValidator
  implements RowValidator<RawStudentRow, ValidStudentRow>
{
  public async validate(
    row: RawStudentRow,
    // ctx unused — schoolId is implicit via RequestContext on commit.
    _ctx: ImportContext,
  ): Promise<ValidationResult<ValidStudentRow>> {
    const issues: RowValidationIssue[] = [];
    // Row number is 1-based; handler passes it in via row.__rowNumber.
    const rowNumber =
      typeof row.__rowNumber === 'number' ? (row.__rowNumber as number) : 0;
    const snapshot = sanitizeSnapshot(row);

    const admissionNo = pickRequiredString(row, 'admissionNo', rowNumber, snapshot, issues);
    const firstName = pickRequiredString(row, 'firstName', rowNumber, snapshot, issues);
    const lastName = pickRequiredString(row, 'lastName', rowNumber, snapshot, issues);
    const dobRaw = pickRequiredString(row, 'dateOfBirth', rowNumber, snapshot, issues);
    const admittedOnRaw = pickRequiredString(row, 'admittedOn', rowNumber, snapshot, issues);
    const genderRaw = pickRequiredString(row, 'gender', rowNumber, snapshot, issues);
    const classId = pickRequiredString(row, 'classId', rowNumber, snapshot, issues);
    const sectionId = pickRequiredString(row, 'sectionId', rowNumber, snapshot, issues);
    const academicYearId = pickRequiredString(
      row,
      'academicYearId',
      rowNumber,
      snapshot,
      issues,
    );

    let dateOfBirth: Date | null = null;
    if (dobRaw !== null) {
      dateOfBirth = parseIsoDate(dobRaw);
      if (dateOfBirth === null) {
        issues.push(makeIssue(rowNumber, 'dateOfBirth', 'ERROR', 'INVALID_DATE', `Invalid date "${dobRaw}" — expected YYYY-MM-DD.`, snapshot, dobRaw));
      }
    }

    let admittedOn: Date | null = null;
    if (admittedOnRaw !== null) {
      admittedOn = parseIsoDate(admittedOnRaw);
      if (admittedOn === null) {
        issues.push(makeIssue(rowNumber, 'admittedOn', 'ERROR', 'INVALID_DATE', `Invalid date "${admittedOnRaw}" — expected YYYY-MM-DD.`, snapshot, admittedOnRaw));
      }
    }

    let gender: GenderValue | null = null;
    if (genderRaw !== null) {
      const upper = genderRaw.toUpperCase();
      if (!GENDER_VALUES.has(upper as GenderValue)) {
        issues.push(makeIssue(rowNumber, 'gender', 'ERROR', 'INVALID_ENUM', `Invalid gender "${genderRaw}" — expected one of MALE, FEMALE, OTHER.`, snapshot, genderRaw));
      } else {
        gender = upper as GenderValue;
      }
    }

    if (classId !== null && !UUID_PATTERN.test(classId)) {
      issues.push(makeIssue(rowNumber, 'classId', 'ERROR', 'INVALID_UUID', `classId "${classId}" is not a valid UUID.`, snapshot, classId));
    }
    if (sectionId !== null && !UUID_PATTERN.test(sectionId)) {
      issues.push(makeIssue(rowNumber, 'sectionId', 'ERROR', 'INVALID_UUID', `sectionId "${sectionId}" is not a valid UUID.`, snapshot, sectionId));
    }
    if (academicYearId !== null && !UUID_PATTERN.test(academicYearId)) {
      issues.push(makeIssue(rowNumber, 'academicYearId', 'ERROR', 'INVALID_UUID', `academicYearId "${academicYearId}" is not a valid UUID.`, snapshot, academicYearId));
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    const output: ValidStudentRow = {
      rowNumber,
      admissionNo: admissionNo as string,
      firstName: firstName as string,
      lastName: lastName as string,
      dateOfBirth: dateOfBirth as Date,
      gender: gender as GenderValue,
      classId: classId as string,
      sectionId: sectionId as string,
      academicYearId: academicYearId as string,
      admittedOn: admittedOn as Date,
      bloodGroup: pickOptionalString(row, 'bloodGroup'),
      religion: (pickOptionalString(row, 'religion') as ReligionValue) ?? 'NOT_DECLARED',
      category:
        (pickOptionalString(row, 'category') as SocialCategoryValue) ?? 'NOT_DECLARED',
      nationality: pickOptionalString(row, 'nationality') ?? 'INDIAN',
      motherTongue: pickOptionalString(row, 'motherTongue'),
      rollNo: pickOptionalString(row, 'rollNo'),
      photoUrl: pickOptionalString(row, 'photoUrl'),
      admissionType: 'FRESH',
      isCwsn: false,
      isRte: false,
      isMinority: false,
      isBpl: false,
    };
    return { ok: true, output };
  }
}

function sanitizeSnapshot(row: RawStudentRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === '__rowNumber') continue;
    out[k] = v;
  }
  return out;
}

function pickRequiredString(
  row: RawStudentRow,
  field: string,
  rowNumber: number,
  snapshot: Record<string, unknown>,
  issues: RowValidationIssue[],
): string | null {
  const raw = (row as Record<string, unknown>)[field];
  if (raw === undefined || raw === null) {
    issues.push(
      makeIssue(
        rowNumber,
        field,
        'ERROR',
        'REQUIRED_FIELD_MISSING',
        `Required column "${field}" is missing.`,
        snapshot,
        null,
      ),
    );
    return null;
  }
  const str = String(raw).trim();
  if (str.length === 0) {
    issues.push(
      makeIssue(
        rowNumber,
        field,
        'ERROR',
        'REQUIRED_FIELD_MISSING',
        `Required column "${field}" is empty.`,
        snapshot,
        '',
      ),
    );
    return null;
  }
  return str;
}

function pickOptionalString(
  row: RawStudentRow,
  field: string,
): string | null {
  const raw = (row as Record<string, unknown>)[field];
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  return str.length === 0 ? null : str;
}

function parseIsoDate(raw: string): Date | null {
  if (!ISO_DATE_PATTERN.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeIssue(
  rowNumber: number,
  columnName: string,
  severity: RowValidationIssue['severity'],
  code: string,
  message: string,
  snapshot: Record<string, unknown>,
  providedValue: string | null,
): RowValidationIssue {
  return {
    rowNumber,
    columnName,
    severity,
    code,
    message,
    providedValue,
    rowSnapshot: snapshot,
  };
}
