/**
 * Stub template specs for the 4 import kinds whose live decoders land in
 * future sprints (STAFF / EXAM_MARKS / ATTENDANCE / FEE_PAYMENT). Each
 * declares 1-2 columns + 1 sample row so the template-download endpoint
 * is exercised across all kinds — even though the parser throws
 * ImportKindNotImplementedError when an uploaded file is processed.
 */
import type { ImportTemplateSpec } from './template.types';

export const STAFF_TEMPLATE_SPEC: ImportTemplateSpec = {
  kind: 'STAFF',
  columns: [
    { name: 'staffCode', key: 'staffCode', required: true, example: 'STF-001' },
    { name: 'firstName', key: 'firstName', required: true, example: 'Rahul' },
    { name: 'lastName', key: 'lastName', required: true, example: 'Verma' },
  ],
  samples: [
    { staffCode: 'STF-001', firstName: 'Rahul', lastName: 'Verma' },
  ],
};

export const EXAM_MARKS_TEMPLATE_SPEC: ImportTemplateSpec = {
  kind: 'EXAM_MARKS',
  columns: [
    { name: 'admissionNo', key: 'admissionNo', required: true, example: 'ADM-1001' },
    { name: 'examCode', key: 'examCode', required: true, example: 'TERM-1' },
    { name: 'subjectCode', key: 'subjectCode', required: true, example: 'MATH' },
    { name: 'marks', key: 'marks', required: true, example: '78' },
  ],
  samples: [
    { admissionNo: 'ADM-1001', examCode: 'TERM-1', subjectCode: 'MATH', marks: '78' },
  ],
};

export const ATTENDANCE_TEMPLATE_SPEC: ImportTemplateSpec = {
  kind: 'ATTENDANCE',
  columns: [
    { name: 'admissionNo', key: 'admissionNo', required: true, example: 'ADM-1001' },
    { name: 'date', key: 'date', required: true, description: 'YYYY-MM-DD.', example: '2026-06-23' },
    { name: 'status', key: 'status', required: true, description: 'PRESENT | ABSENT | LATE.', example: 'PRESENT' },
  ],
  samples: [
    { admissionNo: 'ADM-1001', date: '2026-06-23', status: 'PRESENT' },
  ],
};

export const FEE_PAYMENT_TEMPLATE_SPEC: ImportTemplateSpec = {
  kind: 'FEE_PAYMENT',
  columns: [
    { name: 'admissionNo', key: 'admissionNo', required: true, example: 'ADM-1001' },
    { name: 'amount', key: 'amount', required: true, example: '1500.00' },
    { name: 'paidOn', key: 'paidOn', required: true, description: 'YYYY-MM-DD.', example: '2026-06-23' },
    { name: 'mode', key: 'mode', required: false, description: 'CASH | CARD | UPI | BANK | OTHER.', example: 'UPI' },
  ],
  samples: [
    { admissionNo: 'ADM-1001', amount: '1500.00', paidOn: '2026-06-23', mode: 'UPI' },
  ],
};
