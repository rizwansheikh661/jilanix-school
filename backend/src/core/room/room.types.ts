import type { RoomStatusValue } from './room.constants';

interface AuditTail {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface RoomTypeRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly code: string;
  readonly name: string;
  readonly defaultCapacity: number | null;
  readonly allowsExam: boolean;
  readonly allowsTimetable: boolean;
  readonly description: string | null;
}

export interface RoomRow extends AuditTail {
  readonly id: string;
  readonly schoolId: string;
  readonly branchId: string;
  readonly roomTypeId: string;
  readonly code: string;
  readonly name: string;
  readonly capacity: number;
  readonly floor: string | null;
  readonly block: string | null;
  readonly status: RoomStatusValue;
  readonly notes: string | null;
}
