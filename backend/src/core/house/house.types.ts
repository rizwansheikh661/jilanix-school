interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface HouseRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly colorHex: string;
  readonly motto: string | null;
  readonly captainStudentId: string | null;
  readonly viceCaptainStudentId: string | null;
  readonly photoUrl: string | null;
  readonly sortOrder: number;
}

export interface HouseAssignmentRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly houseId: string;
  readonly academicYearId: string;
  readonly assignedOn: Date;
  readonly endedOn: Date | null;
  readonly reason: string | null;
}
