/**
 * StudentUser DTOs — request/response shapes for the student-portal
 * admin endpoints (`POST /students/:id/users`, suspend, reactivate,
 * archive, list). Mirrors `ParentUserDto`; differences: no `relation`
 * field (students are 1:1 with their User), and the FSM enum is
 * `StudentUserStatusValue`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import {
  STUDENT_USER_STATUS_VALUES,
  type StudentUserRow,
  type StudentUserStatusValue,
} from '../student.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Body for `POST /students/:id/users` — admin invitation. The Student
 * row is identified via the URL path; the body carries the User-facing
 * identity (email/name).
 */
export class InviteStudentUserDto {
  @ApiProperty({ format: 'email', maxLength: 255 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  public readonly email!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  public readonly displayName!: string;

  @ApiPropertyOptional({
    maxLength: 32,
    description: 'Optional preferred locale (defaults to school default).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  public readonly locale?: string;
}

/** Body for `POST /students/:id/users/:userId/resend-invite`. */
export class ResendStudentInviteDto {
  @ApiProperty({ minimum: 1 })
  public readonly expectedVersion!: number;
}

/** Body for the suspend/reactivate/archive lifecycle endpoints. */
export class StudentLifecycleActionDto {
  @ApiProperty({ minimum: 1 })
  public readonly expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public readonly reason?: string;
}

export class StudentUserResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly studentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly userId!: string;
  @ApiProperty({ enum: STUDENT_USER_STATUS_VALUES as unknown as string[] })
  public readonly status!: StudentUserStatusValue;
  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly invitedAt!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly activatedAt!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly suspendedAt!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly archivedAt!: string | null;
  @ApiProperty({ nullable: true, format: 'date-time' })
  public readonly lastInviteAt!: string | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly createdBy!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' })
  public readonly updatedBy!: string | null;

  public static from(row: StudentUserRow): StudentUserResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      userId: row.userId,
      status: row.status,
      invitedAt: row.invitedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
      suspendedAt: row.suspendedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      lastInviteAt: row.lastInviteAt?.toISOString() ?? null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }
}

export class StudentUserListResponseDto {
  @ApiProperty({ type: [StudentUserResponseDto] })
  public readonly items!: readonly StudentUserResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

/**
 * Response from `POST /students/:id/users` — exposes the (non-secret)
 * invite-expiry timestamp + userId to the admin tenant. The cleartext
 * token never leaves the outbox handler that ships the email.
 */
export class InviteStudentUserResponseDto {
  @ApiProperty({ type: StudentUserResponseDto })
  public readonly studentUser!: StudentUserResponseDto;

  @ApiProperty({ format: 'uuid' })
  public readonly userId!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly inviteExpiresAt!: string;
}
