/**
 * StudentImportRowValidator unit specs — happy + each error code.
 */
import type { ImportContext } from '../reporting.types';
import { StudentImportRowValidator } from './student-import-row.validator';

const CTX: ImportContext = {
  schoolId: 'school-1',
  userId: 'user-1',
  importJobId: 'imp-1',
  options: {},
};

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';
const UUID_C = '00000000-0000-4000-8000-000000000003';

function happyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    __rowNumber: 1,
    admissionNo: 'A001',
    firstName: 'Aisha',
    lastName: 'Khan',
    dateOfBirth: '2010-05-12',
    gender: 'FEMALE',
    classId: UUID_A,
    sectionId: UUID_B,
    academicYearId: UUID_C,
    admittedOn: '2024-04-01',
    ...overrides,
  };
}

describe('StudentImportRowValidator.validate', () => {
  const v = new StudentImportRowValidator();

  it('returns ok with normalized output for a valid row', async () => {
    const result = await v.validate(happyRow(), CTX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.admissionNo).toBe('A001');
      expect(result.output.gender).toBe('FEMALE');
      expect(result.output.classId).toBe(UUID_A);
      expect(result.output.dateOfBirth).toBeInstanceOf(Date);
      expect(result.output.admittedOn).toBeInstanceOf(Date);
      expect(result.output.religion).toBe('NOT_DECLARED');
      expect(result.output.category).toBe('NOT_DECLARED');
      expect(result.output.nationality).toBe('INDIAN');
    }
  });

  it('flags REQUIRED_FIELD_MISSING when admissionNo missing', async () => {
    const row = happyRow();
    delete (row as Record<string, unknown>)['admissionNo'];
    const result = await v.validate(row, CTX);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.code === 'REQUIRED_FIELD_MISSING' && i.columnName === 'admissionNo',
        ),
      ).toBe(true);
    }
  });

  it('flags INVALID_ENUM for bad gender', async () => {
    const result = await v.validate(
      happyRow({ gender: 'WHO_KNOWS' }),
      CTX,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.code === 'INVALID_ENUM' && i.columnName === 'gender',
        ),
      ).toBe(true);
    }
  });

  it('flags INVALID_UUID for non-UUID classId', async () => {
    const result = await v.validate(
      happyRow({ classId: 'not-a-uuid' }),
      CTX,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.code === 'INVALID_UUID' && i.columnName === 'classId',
        ),
      ).toBe(true);
    }
  });

  it('flags INVALID_DATE for bad dateOfBirth', async () => {
    const result = await v.validate(
      happyRow({ dateOfBirth: '12-12-2010' }),
      CTX,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.code === 'INVALID_DATE' && i.columnName === 'dateOfBirth',
        ),
      ).toBe(true);
    }
  });
});
