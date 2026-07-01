/**
 * STUDENT import template spec — derived from StudentParser-accepted headers
 * + StudentImportRowValidator required-field set.
 *
 * Required columns mirror the validator's `pickRequiredString` calls:
 *   admissionNo, firstName, lastName, dateOfBirth, gender, classId,
 *   sectionId, academicYearId, admittedOn.
 *
 * Sample rows demonstrate ISO date format + UUID FK shape so admins know
 * what to paste.
 */
import type { ImportTemplateSpec } from './template.types';

const SAMPLE_CLASS_ID = '11111111-1111-1111-1111-111111111111';
const SAMPLE_SECTION_ID = '22222222-2222-2222-2222-222222222222';
const SAMPLE_ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

export const STUDENT_TEMPLATE_SPEC: ImportTemplateSpec = {
  kind: 'STUDENT',
  columns: [
    { name: 'admissionNo', key: 'admissionNo', required: true, description: 'School-issued unique admission number.', example: 'ADM-1001' },
    { name: 'firstName', key: 'firstName', required: true, example: 'Aanya' },
    { name: 'lastName', key: 'lastName', required: true, example: 'Sharma' },
    { name: 'dateOfBirth', key: 'dateOfBirth', required: true, description: 'YYYY-MM-DD.', example: '2010-04-15' },
    { name: 'gender', key: 'gender', required: true, description: 'MALE | FEMALE | OTHER.', example: 'FEMALE' },
    { name: 'classId', key: 'classId', required: true, description: 'UUID of the target class.', example: SAMPLE_CLASS_ID },
    { name: 'sectionId', key: 'sectionId', required: true, description: 'UUID of the target section.', example: SAMPLE_SECTION_ID },
    { name: 'academicYearId', key: 'academicYearId', required: true, description: 'UUID of the active academic year.', example: SAMPLE_ACADEMIC_YEAR_ID },
    { name: 'admittedOn', key: 'admittedOn', required: true, description: 'YYYY-MM-DD admission date.', example: '2024-04-01' },
    { name: 'bloodGroup', key: 'bloodGroup', required: false, example: 'O+' },
    { name: 'religion', key: 'religion', required: false, description: 'HINDU | MUSLIM | CHRISTIAN | SIKH | BUDDHIST | JAIN | OTHER | NOT_DECLARED.', example: 'HINDU' },
    { name: 'category', key: 'category', required: false, description: 'GENERAL | OBC | SC | ST | EWS | NOT_DECLARED.', example: 'GENERAL' },
    { name: 'nationality', key: 'nationality', required: false, example: 'INDIAN' },
    { name: 'motherTongue', key: 'motherTongue', required: false, example: 'HINDI' },
    { name: 'rollNo', key: 'rollNo', required: false, example: '12' },
    { name: 'photoUrl', key: 'photoUrl', required: false, example: 'https://cdn.example.com/p.jpg' },
  ],
  samples: [
    {
      admissionNo: 'ADM-1001',
      firstName: 'Aanya',
      lastName: 'Sharma',
      dateOfBirth: '2010-04-15',
      gender: 'FEMALE',
      classId: SAMPLE_CLASS_ID,
      sectionId: SAMPLE_SECTION_ID,
      academicYearId: SAMPLE_ACADEMIC_YEAR_ID,
      admittedOn: '2024-04-01',
      bloodGroup: 'O+',
      religion: 'HINDU',
      category: 'GENERAL',
      nationality: 'INDIAN',
      motherTongue: 'HINDI',
      rollNo: '12',
      photoUrl: '',
    },
    {
      admissionNo: 'ADM-1002',
      firstName: 'Bharath',
      lastName: 'Iyer',
      dateOfBirth: '2010-06-22',
      gender: 'MALE',
      classId: SAMPLE_CLASS_ID,
      sectionId: SAMPLE_SECTION_ID,
      academicYearId: SAMPLE_ACADEMIC_YEAR_ID,
      admittedOn: '2024-04-01',
      bloodGroup: 'A+',
      religion: 'HINDU',
      category: 'OBC',
      nationality: 'INDIAN',
      motherTongue: 'TAMIL',
      rollNo: '13',
      photoUrl: '',
    },
  ],
};
