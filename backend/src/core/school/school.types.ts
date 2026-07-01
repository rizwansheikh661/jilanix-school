/**
 * Public row shapes for the School-domain sibling tables.
 */

export type SchoolBoardValue =
  | 'CBSE' | 'ICSE' | 'IB' | 'IGCSE' | 'STATE_BOARD' | 'NIOS' | 'OTHER';
export const SCHOOL_BOARD_VALUES: readonly SchoolBoardValue[] = Object.freeze([
  'CBSE', 'ICSE', 'IB', 'IGCSE', 'STATE_BOARD', 'NIOS', 'OTHER',
]);

export type SchoolTypeValue = 'PRIVATE' | 'GOVT' | 'AIDED' | 'TRUST';
export const SCHOOL_TYPE_VALUES: readonly SchoolTypeValue[] = Object.freeze([
  'PRIVATE', 'GOVT', 'AIDED', 'TRUST',
]);

export type SchoolCategoryValue =
  | 'PRESCHOOL' | 'PRIMARY' | 'MIDDLE' | 'SECONDARY' | 'HIGHER_SECONDARY' | 'COMPOSITE';
export const SCHOOL_CATEGORY_VALUES: readonly SchoolCategoryValue[] = Object.freeze([
  'PRESCHOOL', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY', 'COMPOSITE',
]);

export type SchoolGenderTypeValue = 'BOYS' | 'GIRLS' | 'COED';
export const SCHOOL_GENDER_TYPE_VALUES: readonly SchoolGenderTypeValue[] = Object.freeze([
  'BOYS', 'GIRLS', 'COED',
]);

export type ContactTypeValue = 'PHONE' | 'EMAIL' | 'PERSON' | 'SOCIAL' | 'EMERGENCY';
export const CONTACT_TYPE_VALUES: readonly ContactTypeValue[] = Object.freeze([
  'PHONE', 'EMAIL', 'PERSON', 'SOCIAL', 'EMERGENCY',
]);

export type SchoolDocumentTypeValue =
  | 'REGISTRATION_CERT' | 'AFFILIATION_CERT' | 'NOC' | 'GST_CERT'
  | 'PAN_CERT' | 'TRUST_DEED' | 'SOCIETY_DEED' | 'OTHER';
export const SCHOOL_DOCUMENT_TYPE_VALUES: readonly SchoolDocumentTypeValue[] = Object.freeze([
  'REGISTRATION_CERT', 'AFFILIATION_CERT', 'NOC', 'GST_CERT',
  'PAN_CERT', 'TRUST_DEED', 'SOCIETY_DEED', 'OTHER',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface SchoolProfileRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly board: SchoolBoardValue | null;
  readonly affiliationNumber: string | null;
  readonly affiliationValidTill: Date | null;
  readonly schoolType: SchoolTypeValue;
  readonly schoolCategory: SchoolCategoryValue;
  readonly genderType: SchoolGenderTypeValue;
  readonly mediumOfInstruction: string;
  readonly establishedYear: number | null;
  readonly registrationNumber: string | null;
  readonly trustName: string | null;
  readonly principalName: string | null;
  readonly principalPhone: string | null;
  readonly principalEmail: string | null;
  readonly totalAreaSqft: number | null;
  readonly builtUpAreaSqft: number | null;
  readonly studentCapacity: number | null;
  readonly motto: string | null;
  readonly mission: string | null;
  readonly vision: string | null;
}

export interface SchoolBrandingRow {
  readonly id: string;
  readonly schoolId: string;
  readonly shortName: string | null;
  readonly tagline: string | null;
  readonly logoUrl: string | null;
  readonly darkLogoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly letterheadUrl: string | null;
  readonly loginBackgroundUrl: string | null;
  readonly emailBannerUrl: string | null;
  readonly pdfHeaderUrl: string | null;
  readonly pdfFooterUrl: string | null;
  readonly brandPrimaryHex: string | null;
  readonly brandSecondaryHex: string | null;
  readonly brandAccentHex: string | null;
  readonly fontFamily: string | null;
  readonly supportEmail: string | null;
  readonly supportPhone: string | null;
  readonly websiteUrl: string | null;
  readonly footerText: string | null;
  readonly copyrightText: string | null;
  readonly socialLinksJson: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface SchoolContactRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly contactType: ContactTypeValue;
  readonly label: string;
  readonly value: string;
  readonly isPrimary: boolean;
  readonly sortOrder: number;
}

export interface SchoolDocumentRow {
  readonly id: string;
  readonly schoolId: string;
  readonly documentType: SchoolDocumentTypeValue;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
  readonly issueDate: Date | null;
  readonly expiryDate: Date | null;
  readonly issuingAuthority: string | null;
  readonly docNumber: string | null;
  readonly notes: string | null;
  readonly uploadedBy: string | null;
  readonly uploadedAt: Date;
}
