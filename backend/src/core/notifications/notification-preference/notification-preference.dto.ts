/**
 * DTOs for `/api/v1/notifications/preferences`. Shape + per-field validation
 * only; the service enforces tenant scope, opt-out structure, and audit.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  DEFAULT_LOCALE,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  DEFAULT_QUIET_HOURS_TIMEZONE,
  QUIET_HOURS_PATTERN,
} from '../notifications.constants';

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly channelEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly channelSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly channelWhatsapp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly channelInApp?: boolean;

  @ApiPropertyOptional({
    description:
      'Shape: { [NotificationCategory]: NotificationChannel[] }. ' +
      'Channels listed are opted-out for that category.',
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  public readonly categoryOptOuts?: Record<string, readonly string[]> | null;

  @ApiPropertyOptional({
    pattern: QUIET_HOURS_PATTERN.source,
    example: DEFAULT_QUIET_HOURS_START,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(QUIET_HOURS_PATTERN)
  public readonly quietHoursStart?: string | null;

  @ApiPropertyOptional({
    pattern: QUIET_HOURS_PATTERN.source,
    example: DEFAULT_QUIET_HOURS_END,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(QUIET_HOURS_PATTERN)
  public readonly quietHoursEnd?: string | null;

  @ApiPropertyOptional({
    maxLength: 40,
    example: DEFAULT_QUIET_HOURS_TIMEZONE,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  public readonly quietHoursTimezone?: string | null;

  @ApiPropertyOptional({ minLength: 2, maxLength: 5, example: DEFAULT_LOCALE })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  public readonly locale?: string;
}

export class NotificationPreferenceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly userId!: string;
  @ApiProperty() public readonly channelEmail!: boolean;
  @ApiProperty() public readonly channelSms!: boolean;
  @ApiProperty() public readonly channelWhatsapp!: boolean;
  @ApiProperty() public readonly channelInApp!: boolean;
  @ApiPropertyOptional({ nullable: true })
  public readonly categoryOptOuts!: Record<string, readonly string[]> | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursStart!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursEnd!: string | null;
  @ApiPropertyOptional({ nullable: true })
  public readonly quietHoursTimezone!: string | null;
  @ApiProperty() public readonly locale!: string;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
}
