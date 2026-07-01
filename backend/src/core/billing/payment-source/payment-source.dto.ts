/**
 * Payment source DTOs — request/response shapes for platform-managed payment
 * sources. Response NEVER carries the encrypted blob or plaintext secrets;
 * only boolean presence flags (`hasRazorpaySecret`).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import {
  PAYMENT_SOURCE_TYPE_VALUES,
  type PaymentSourceRow,
  type PaymentSourceTypeValue,
} from '../billing.types';

export class CreatePaymentSourceDto {
  @ApiProperty({ enum: PAYMENT_SOURCE_TYPE_VALUES })
  @IsIn([...PAYMENT_SOURCE_TYPE_VALUES])
  public sourceType!: PaymentSourceTypeValue;

  @ApiProperty({ maxLength: 120 })
  @IsString() @Length(1, 120)
  public name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  public isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  public isDefault?: boolean;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional() @IsInt() @Min(0)
  public priority?: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  public razorpayKeyId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 256, description: 'Plaintext — sealed at rest.' })
  @IsOptional() @IsString() @MaxLength(256)
  public razorpayKeySecret?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 256, description: 'Plaintext — sealed at rest.' })
  @IsOptional() @IsString() @MaxLength(256)
  public razorpayWebhookSecret?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public upiHandle?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public bankAccountNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional() @IsString() @MaxLength(20)
  public bankIfsc?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankBranch?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankAccountHolder?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public instructions?: string | null;
}

export class UpdatePaymentSourceDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional() @IsString() @Length(1, 120)
  public name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public description?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public isActive?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  public isDefault?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  public priority?: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  public razorpayKeyId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 256, description: 'Plaintext — sealed at rest.' })
  @IsOptional() @IsString() @MaxLength(256)
  public razorpayKeySecret?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 256, description: 'Plaintext — sealed at rest.' })
  @IsOptional() @IsString() @MaxLength(256)
  public razorpayWebhookSecret?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public upiHandle?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public bankAccountNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @IsOptional() @IsString() @MaxLength(20)
  public bankIfsc?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankBranch?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  public bankAccountHolder?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public instructions?: string | null;
}

export class ListPaymentSourcesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_SOURCE_TYPE_VALUES })
  @IsOptional() @IsIn([...PAYMENT_SOURCE_TYPE_VALUES])
  public readonly sourceType?: PaymentSourceTypeValue;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  public readonly isActive?: boolean;
}

export class PaymentSourceResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty({ enum: PAYMENT_SOURCE_TYPE_VALUES }) public sourceType!: PaymentSourceTypeValue;
  @ApiProperty() public name!: string;
  @ApiProperty({ nullable: true }) public description!: string | null;
  @ApiProperty() public isActive!: boolean;
  @ApiProperty() public isDefault!: boolean;
  @ApiProperty() public priority!: number;
  @ApiProperty({ nullable: true }) public razorpayKeyId!: string | null;
  /** True when an encrypted Razorpay key secret is on file. Never the value. */
  @ApiProperty() public hasRazorpaySecret!: boolean;
  /** True when an encrypted webhook secret is on file. Never the value. */
  @ApiProperty() public hasRazorpayWebhookSecret!: boolean;
  @ApiProperty({ nullable: true }) public upiHandle!: string | null;
  @ApiProperty({ nullable: true }) public bankName!: string | null;
  @ApiProperty({ nullable: true }) public bankAccountNumber!: string | null;
  @ApiProperty({ nullable: true }) public bankIfsc!: string | null;
  @ApiProperty({ nullable: true }) public bankBranch!: string | null;
  @ApiProperty({ nullable: true }) public bankAccountHolder!: string | null;
  @ApiProperty({ nullable: true }) public instructions!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: PaymentSourceRow): PaymentSourceResponseDto {
    const dto = new PaymentSourceResponseDto();
    dto.id = row.id;
    dto.sourceType = row.sourceType;
    dto.name = row.name;
    dto.description = row.description;
    dto.isActive = row.isActive;
    dto.isDefault = row.isDefault;
    dto.priority = row.priority;
    dto.razorpayKeyId = row.razorpayKeyId;
    dto.hasRazorpaySecret = row.hasRazorpaySecret;
    dto.hasRazorpayWebhookSecret = row.hasRazorpayWebhookSecret;
    dto.upiHandle = row.upiHandle;
    dto.bankName = row.bankName;
    dto.bankAccountNumber = row.bankAccountNumber;
    dto.bankIfsc = row.bankIfsc;
    dto.bankBranch = row.bankBranch;
    dto.bankAccountHolder = row.bankAccountHolder;
    dto.instructions = row.instructions;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}
