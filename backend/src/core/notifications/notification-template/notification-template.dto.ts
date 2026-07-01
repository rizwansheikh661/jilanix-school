/**
 * DTOs for `/notifications/templates`. Shape + per-field validation only; the
 * service enforces tenant scope, duplicate-code guards, in-use checks, and
 * the channel = EMAIL → subject-required cross-field rule.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  EVENT_KEY_PATTERN,
  MAX_TEMPLATE_BODY_LENGTH,
  NOTIFICATION_AUDIENCE_VALUES,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_CODE_PATTERN,
  NOTIFICATION_PRIORITY_VALUES,
  type NotificationAudienceValue,
  type NotificationCategoryValue,
  type NotificationChannelValue,
  type NotificationPriorityValue,
} from '../notifications.constants';

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

export class ListNotificationTemplatesQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel?: NotificationChannelValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CATEGORY_VALUES)
  public readonly category?: NotificationCategoryValue;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public readonly isActive?: boolean;

  @ApiPropertyOptional({ maxLength: 80, pattern: EVENT_KEY_PATTERN.source })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(EVENT_KEY_PATTERN)
  public readonly eventKey?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: LIST_MAX_LIMIT,
    default: LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  public readonly limit?: number;
}

export class CreateNotificationTemplateDto {
  @ApiProperty({ maxLength: 60, pattern: NOTIFICATION_CODE_PATTERN.source })
  @IsString()
  @MaxLength(60)
  @Matches(NOTIFICATION_CODE_PATTERN)
  public readonly code!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  public readonly name!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly description?: string | null;

  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES })
  @IsEnum(NOTIFICATION_CHANNEL_VALUES)
  public readonly channel!: NotificationChannelValue;

  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsEnum(NOTIFICATION_CATEGORY_VALUES)
  public readonly category!: NotificationCategoryValue;

  @ApiPropertyOptional({ maxLength: 80, pattern: EVENT_KEY_PATTERN.source })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(EVENT_KEY_PATTERN)
  public readonly eventKey?: string;

  @ApiPropertyOptional({
    enum: NOTIFICATION_PRIORITY_VALUES,
    default: 'MEDIUM',
  })
  @IsOptional()
  @IsEnum(NOTIFICATION_PRIORITY_VALUES)
  public readonly defaultPriority?: NotificationPriorityValue;

  @ApiPropertyOptional({ minLength: 5, maxLength: 5, default: 'en-IN' })
  @IsOptional()
  @IsString()
  @Length(5, 5)
  public readonly locale?: string;

  @ApiPropertyOptional({
    enum: NOTIFICATION_AUDIENCE_VALUES,
    default: 'USER',
  })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly audience?: NotificationAudienceValue;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  public readonly variablesSpec?: Record<string, unknown>;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Required if channel = EMAIL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public readonly subject?: string;

  @ApiProperty({ maxLength: MAX_TEMPLATE_BODY_LENGTH })
  @IsString()
  @MaxLength(MAX_TEMPLATE_BODY_LENGTH)
  public readonly bodyText!: string;

  @ApiPropertyOptional({ maxLength: MAX_TEMPLATE_BODY_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEMPLATE_BODY_LENGTH)
  public readonly bodyHtml?: string;
}

export class UpdateNotificationTemplateDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly description?: string | null;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_CATEGORY_VALUES)
  public readonly category?: NotificationCategoryValue;

  @ApiPropertyOptional({ enum: NOTIFICATION_PRIORITY_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_PRIORITY_VALUES)
  public readonly defaultPriority?: NotificationPriorityValue;

  @ApiPropertyOptional({ minLength: 5, maxLength: 5 })
  @IsOptional()
  @IsString()
  @Length(5, 5)
  public readonly locale?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_AUDIENCE_VALUES })
  @IsOptional()
  @IsEnum(NOTIFICATION_AUDIENCE_VALUES)
  public readonly audience?: NotificationAudienceValue;

  @ApiPropertyOptional({ maxLength: 80, pattern: EVENT_KEY_PATTERN.source })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(EVENT_KEY_PATTERN)
  public readonly eventKey?: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  public readonly variablesSpec?: Record<string, unknown> | null;
}

export class AppendNotificationTemplateVersionDto {
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Required if template channel = EMAIL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public readonly subject?: string;

  @ApiProperty({ maxLength: MAX_TEMPLATE_BODY_LENGTH })
  @IsString()
  @MaxLength(MAX_TEMPLATE_BODY_LENGTH)
  public readonly bodyText!: string;

  @ApiPropertyOptional({ maxLength: MAX_TEMPLATE_BODY_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEMPLATE_BODY_LENGTH)
  public readonly bodyHtml?: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  public readonly variablesSnapshot?: Record<string, unknown>;
}

export class NotificationTemplateVersionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly notificationTemplateId!: string;
  @ApiProperty() public readonly versionNo!: number;
  @ApiPropertyOptional({ nullable: true })
  public readonly subject!: string | null;
  @ApiProperty() public readonly bodyText!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly bodyHtml!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Object })
  public readonly variablesSnapshot!: Record<string, unknown> | null;
  @ApiProperty() public readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly createdBy!: string | null;
}

export class NotificationTemplateResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly schoolId!: string;
  @ApiProperty() public readonly code!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly description!: string | null;
  @ApiProperty({ enum: NOTIFICATION_CHANNEL_VALUES })
  public readonly channel!: NotificationChannelValue;
  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  public readonly category!: NotificationCategoryValue;
  @ApiPropertyOptional({ nullable: true })
  public readonly eventKey!: string | null;
  @ApiProperty({ enum: NOTIFICATION_PRIORITY_VALUES })
  public readonly defaultPriority!: NotificationPriorityValue;
  @ApiProperty() public readonly locale!: string;
  @ApiProperty() public readonly isActive!: boolean;
  @ApiProperty() public readonly activeVersionNo!: number;
  @ApiProperty({ enum: NOTIFICATION_AUDIENCE_VALUES })
  public readonly audience!: NotificationAudienceValue;
  @ApiPropertyOptional({ nullable: true, type: Object })
  public readonly variablesSpec!: Record<string, unknown> | null;
  @ApiProperty() public readonly version!: number;
  @ApiProperty() public readonly createdAt!: string;
  @ApiProperty() public readonly updatedAt!: string;
  @ApiPropertyOptional({ nullable: true, type: () => NotificationTemplateVersionResponseDto })
  public readonly activeVersion?: NotificationTemplateVersionResponseDto;
}

export class NotificationTemplateListResponseDto {
  @ApiProperty({ type: () => [NotificationTemplateResponseDto] })
  public readonly items!: readonly NotificationTemplateResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  public readonly nextCursor!: string | null;
}

export class NotificationTemplateVersionListResponseDto {
  @ApiProperty({ type: () => [NotificationTemplateVersionResponseDto] })
  public readonly items!: readonly NotificationTemplateVersionResponseDto[];
}
