/**
 * Internal row interfaces and value enumerations for the Parent domain.
 * Services and controllers consume these narrow shapes instead of
 * Prisma's generated model types so accidentally leaking infra-only
 * columns onto the wire requires an explicit edit here.
 */

export type ParentRelationValue = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'GRANDPARENT' | 'OTHER';

export const PARENT_RELATION_VALUES: readonly ParentRelationValue[] = Object.freeze([
  'FATHER',
  'MOTHER',
  'GUARDIAN',
  'GRANDPARENT',
  'OTHER',
]);

/** Sprint 17 — ParentUser lifecycle status. */
export type ParentUserStatusValue = 'PENDING_INVITE' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export const PARENT_USER_STATUS_VALUES: readonly ParentUserStatusValue[] = Object.freeze([
  'PENDING_INVITE',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface ParentRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;

  readonly fatherName: string | null;
  readonly fatherPhone: string | null;
  readonly fatherEmail: string | null;
  readonly fatherOccupation: string | null;

  readonly motherName: string | null;
  readonly motherPhone: string | null;
  readonly motherEmail: string | null;
  readonly motherOccupation: string | null;

  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly guardianEmail: string | null;
  readonly guardianOccupation: string | null;
  readonly guardianRelation: string | null;

  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface ParentStudentLinkRow {
  readonly id: string;
  readonly schoolId: string;
  readonly parentId: string;
  readonly studentId: string;
  readonly relation: ParentRelationValue;
  readonly isPrimaryContact: boolean;
  readonly canPickup: boolean;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

/** Total parent rows allowed per student per BUSINESS_RULES / REST_API_DESIGN §634. */
export const PARENT_LINKS_PER_STUDENT_LIMIT = 3;

/** Sprint 17 — ParentUser junction row shape returned by repo / service. */
export interface ParentUserRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly parentId: string;
  readonly userId: string;
  readonly relation: ParentRelationValue;
  readonly status: ParentUserStatusValue;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly lastInviteAt: Date | null;
}
