/**
 * DTOs for `/events/{id}/participants`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  EVENT_PARTICIPANT_AUDIENCE_VALUES,
  EVENT_PARTICIPANT_STATUS_VALUES,
  EVENT_REGISTRATION_TYPE_VALUES,
  type EventParticipantAudienceValue,
  type EventParticipantStatusValue,
  type EventRegistrationTypeValue,
} from '../events.constants';
import type { EventParticipantRow } from '../events.types';

export class EventParticipantListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EVENT_PARTICIPANT_AUDIENCE_VALUES })
  @IsOptional() @IsEnum(EVENT_PARTICIPANT_AUDIENCE_VALUES)
  public readonly audience?: EventParticipantAudienceValue;

  @ApiPropertyOptional({ enum: EVENT_PARTICIPANT_STATUS_VALUES })
  @IsOptional() @IsEnum(EVENT_PARTICIPANT_STATUS_VALUES)
  public readonly status?: EventParticipantStatusValue;
}

export class RegisterParticipantDto {
  @ApiProperty({ enum: EVENT_PARTICIPANT_AUDIENCE_VALUES })
  @IsEnum(EVENT_PARTICIPANT_AUDIENCE_VALUES)
  public readonly audience!: EventParticipantAudienceValue;

  @ApiProperty()
  @IsUUID()
  public readonly userId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly studentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly staffId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly classId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID()
  public readonly sectionId?: string | null;
}

export class BulkRegisterClassDto {
  @ApiProperty()
  @IsUUID()
  public readonly classId!: string;

  @ApiPropertyOptional({ enum: EVENT_PARTICIPANT_AUDIENCE_VALUES, default: 'STUDENT' })
  @IsOptional() @IsEnum(EVENT_PARTICIPANT_AUDIENCE_VALUES)
  public readonly audience?: EventParticipantAudienceValue;
}

export class BulkRegisterSectionDto {
  @ApiProperty()
  @IsUUID()
  public readonly sectionId!: string;

  @ApiPropertyOptional({ enum: EVENT_PARTICIPANT_AUDIENCE_VALUES, default: 'STUDENT' })
  @IsOptional() @IsEnum(EVENT_PARTICIPANT_AUDIENCE_VALUES)
  public readonly audience?: EventParticipantAudienceValue;
}

export class RejectParticipantDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly reason?: string | null;
}

export class CancelParticipantDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  public readonly reason?: string | null;
}

export class EventParticipantResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly eventId!: string;
  @ApiProperty({ enum: EVENT_PARTICIPANT_AUDIENCE_VALUES })
  public readonly audience!: EventParticipantAudienceValue;
  @ApiProperty() public readonly userId!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly studentId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly staffId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly classId!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly sectionId!: string | null;
  @ApiProperty({ enum: EVENT_PARTICIPANT_STATUS_VALUES })
  public readonly status!: EventParticipantStatusValue;
  @ApiProperty({ enum: EVENT_REGISTRATION_TYPE_VALUES })
  public readonly registrationType!: EventRegistrationTypeValue;
  @ApiProperty() public readonly registeredAt!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly approvedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) public readonly cancelledAt!: string | null;
  @ApiProperty() public readonly registrationSource!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(row: EventParticipantRow): EventParticipantResponseDto {
    return {
      id: row.id,
      eventId: row.eventId,
      audience: row.audience,
      userId: row.userId,
      studentId: row.studentId,
      staffId: row.staffId,
      classId: row.classId,
      sectionId: row.sectionId,
      status: row.status,
      registrationType: row.registrationType,
      registeredAt: row.registeredAt.toISOString(),
      approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      registrationSource: row.registrationSource,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export class EventParticipantListResponseDto {
  @ApiProperty({ type: () => [EventParticipantResponseDto] })
  public readonly items!: readonly EventParticipantResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class BulkRegisterResponseDto {
  @ApiProperty() public readonly registered!: number;
  @ApiProperty() public readonly skipped!: number;

  public static of(registered: number, skipped: number): BulkRegisterResponseDto {
    return Object.assign(new BulkRegisterResponseDto(), { registered, skipped });
  }
}

// silence unused-import lint for class-transformer if no other DTOs use it
void Type;
