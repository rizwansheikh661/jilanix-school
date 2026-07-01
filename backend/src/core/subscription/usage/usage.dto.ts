/**
 * Usage DTOs — response shapes for the `/v1/super-admin/schools/:schoolId/usage*`
 * and `/v1/me/usage` controllers.
 */
import { ApiProperty } from '@nestjs/swagger';

import type {
  SchoolUsageRow,
  UsageEventRow,
} from '../subscription.types';

export class SchoolUsageResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public studentCount!: number;
  @ApiProperty() public staffCount!: number;
  @ApiProperty() public branchCount!: number;
  @ApiProperty() public smsUsedThisPeriod!: number;
  @ApiProperty() public whatsappUsedThisPeriod!: number;
  @ApiProperty() public emailUsedThisPeriod!: number;
  @ApiProperty({ type: String }) public storageBytesUsed!: string;
  @ApiProperty({ type: String }) public usagePeriodStart!: string;
  @ApiProperty({ type: String }) public usagePeriodEnd!: string;
  @ApiProperty({ nullable: true, type: String }) public lastRecomputedAt!: string | null;
  @ApiProperty() public version!: number;

  public static from(row: SchoolUsageRow): SchoolUsageResponseDto {
    const dto = new SchoolUsageResponseDto();
    dto.id = row.id;
    dto.schoolId = row.schoolId;
    dto.studentCount = row.studentCount;
    dto.staffCount = row.staffCount;
    dto.branchCount = row.branchCount;
    dto.smsUsedThisPeriod = row.smsUsedThisPeriod;
    dto.whatsappUsedThisPeriod = row.whatsappUsedThisPeriod;
    dto.emailUsedThisPeriod = row.emailUsedThisPeriod;
    dto.storageBytesUsed = row.storageBytesUsed.toString();
    dto.usagePeriodStart = row.usagePeriodStart.toISOString();
    dto.usagePeriodEnd = row.usagePeriodEnd.toISOString();
    dto.lastRecomputedAt = row.lastRecomputedAt?.toISOString() ?? null;
    dto.version = row.version;
    return dto;
  }
}

export class UsageEventResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public featureKey!: string;
  @ApiProperty() public delta!: number;
  @ApiProperty({ nullable: true }) public actorUserId!: string | null;
  @ApiProperty({ nullable: true }) public sourceRef!: string | null;
  @ApiProperty({ type: String }) public occurredAt!: string;

  public static from(row: UsageEventRow): UsageEventResponseDto {
    const dto = new UsageEventResponseDto();
    dto.id = row.id;
    dto.schoolId = row.schoolId;
    dto.featureKey = row.featureKey;
    dto.delta = row.delta;
    dto.actorUserId = row.actorUserId;
    dto.sourceRef = row.sourceRef;
    dto.occurredAt = row.occurredAt.toISOString();
    return dto;
  }
}

export class UsageEventListResponseDto {
  @ApiProperty({ type: [UsageEventResponseDto] })
  public items!: UsageEventResponseDto[];

  @ApiProperty({ nullable: true })
  public nextCursor!: string | null;
}
