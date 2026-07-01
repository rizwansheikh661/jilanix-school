/**
 * ParentUser DTOs — request/response shapes for the parent-portal admin
 * endpoints (`POST /parents/:id/users`, suspend, reactivate, archive,
 * list). The controller itself lands in W7; the DTOs are isolated here
 * so the W3 service spec and the W4 invitation flow can import them
 * without pulling controller-bound metadata.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import {
  PARENT_RELATION_VALUES,
  PARENT_USER_STATUS_VALUES,
  type ParentRelationValue,
  type ParentUserRow,
  type ParentUserStatusValue,
} from '../parent.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Body for `POST /parents/:id/users` — admin invitation. The Parent row
 * is identified via the URL path; the body carries the User-facing
 * identity (email/name) and the relation slot the invited user occupies.
 */
export class InviteParentUserDto {
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

  @ApiProperty({ enum: PARENT_RELATION_VALUES as unknown as string[] })
  @IsEnum(PARENT_RELATION_VALUES as unknown as object)
  public readonly relation!: ParentRelationValue;

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

/** Body for `POST /parents/:id/users/:userId/resend-invite`. */
export class ResendInviteDto {
  @ApiProperty({ minimum: 1 })
  public readonly expectedVersion!: number;
}

/** Body for the suspend/reactivate/archive lifecycle endpoints. */
export class LifecycleActionDto {
  @ApiProperty({ minimum: 1 })
  public readonly expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  public readonly reason?: string;
}

export class ParentUserResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly schoolId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly parentId!: string;
  @ApiProperty({ format: 'uuid' }) public readonly userId!: string;
  @ApiProperty({ enum: PARENT_RELATION_VALUES as unknown as string[] })
  public readonly relation!: ParentRelationValue;
  @ApiProperty({ enum: PARENT_USER_STATUS_VALUES as unknown as string[] })
  public readonly status!: ParentUserStatusValue;
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

  public static from(row: ParentUserRow): ParentUserResponseDto {
    return {
      id: row.id,
      schoolId: row.schoolId,
      parentId: row.parentId,
      userId: row.userId,
      relation: row.relation,
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

export class ParentUserListResponseDto {
  @ApiProperty({ type: [ParentUserResponseDto] })
  public readonly items!: readonly ParentUserResponseDto[];

  @ApiProperty({ nullable: true })
  public readonly nextCursor!: string | null;
}

/**
 * Response from `POST /parents/:id/users` — exposes the activation link
 * URL only to the admin tenant (the cleartext token is consumed by the
 * outbox handler that sends the email). The `userId` on the response
 * lets the UI deep-link to the freshly created portal user immediately.
 */
export class InviteParentUserResponseDto {
  @ApiProperty({ type: ParentUserResponseDto })
  public readonly parentUser!: ParentUserResponseDto;

  @ApiProperty({ format: 'uuid' })
  public readonly userId!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly inviteExpiresAt!: string;
}
