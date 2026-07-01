/**
 * Billing account DTOs — request/response shapes for the BillingAccount cluster
 * (BillingAccount + BillingProfile + BillingAddress + TaxDetails).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../http/pagination.dto';
import { BILLING_MAX_NOTES_LENGTH } from '../billing.constants';
import type {
  BillingAccountRow,
  BillingAddressRow,
  BillingProfileRow,
  TaxDetailsRow,
} from '../billing.types';

// ---------------------------------------------------------------------------
// Nested input bodies — used by CreateBillingAccountDto so the controller can
// hand the full cluster to BillingAccountService.createAccount in one call.
// ---------------------------------------------------------------------------
export class BillingProfileInputDto {
  @ApiProperty({ maxLength: 255 })
  @IsString() @Length(1, 255)
  public legalName!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public contactName?: string | null;

  @ApiProperty({ maxLength: 255 })
  @IsEmail() @MaxLength(255)
  public contactEmail!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public ccEmails?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public website?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: BILLING_MAX_NOTES_LENGTH })
  @IsOptional() @IsString() @MaxLength(BILLING_MAX_NOTES_LENGTH)
  public notes?: string | null;
}

export class BillingAddressInputDto {
  @ApiProperty({ maxLength: 255 })
  @IsString() @Length(1, 255)
  public addressLine1!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public addressLine2?: string | null;

  @ApiProperty({ maxLength: 100 })
  @IsString() @Length(1, 100)
  public city!: string;

  @ApiProperty({ maxLength: 10 })
  @IsString() @Length(1, 10)
  public stateCode!: string;

  @ApiProperty({ maxLength: 100 })
  @IsString() @Length(1, 100)
  public stateName!: string;

  @ApiProperty({ maxLength: 10 })
  @IsString() @Length(1, 10)
  public pincode!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2, default: 'IN' })
  @IsOptional() @IsString() @Length(2, 2)
  public countryCode?: string;
}

export class TaxDetailsInputDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 15 })
  @IsOptional() @IsString() @MaxLength(15)
  public gstin?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional() @IsString() @MaxLength(10)
  public pan?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional() @IsString() @MaxLength(10)
  public placeOfSupply?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  public taxExempt?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public exemptReason?: string | null;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
export class CreateBillingAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public schoolId!: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'INR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  public currency?: string;

  @ApiProperty({ type: () => BillingProfileInputDto })
  @ValidateNested()
  @Type(() => BillingProfileInputDto)
  public profile!: BillingProfileInputDto;

  @ApiProperty({ type: () => BillingAddressInputDto })
  @ValidateNested()
  @Type(() => BillingAddressInputDto)
  public address!: BillingAddressInputDto;

  @ApiProperty({ type: () => TaxDetailsInputDto })
  @ValidateNested()
  @Type(() => TaxDetailsInputDto)
  public taxDetails!: TaxDetailsInputDto;

  @ApiPropertyOptional({ nullable: true, type: Object, description: 'Optional initial settings overrides.' })
  @IsOptional() @IsObject()
  public settings?: Record<string, unknown> | null;
}

export class ListBillingAccountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public readonly cursorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly isActive?: boolean;
}

export class BillingAccountResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public schoolId!: string;
  @ApiProperty() public accountNumber!: string;
  @ApiProperty() public currency!: string;
  @ApiProperty() public balanceDue!: number;
  @ApiProperty() public creditBalance!: number;
  @ApiProperty() public totalInvoiced!: number;
  @ApiProperty() public totalPaid!: number;
  @ApiProperty() public totalRefunded!: number;
  @ApiProperty() public isActive!: boolean;
  @ApiProperty({ nullable: true, type: String }) public lastInvoiceAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) public lastPaymentAt!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: BillingAccountRow): BillingAccountResponseDto {
    const dto = new BillingAccountResponseDto();
    dto.id = row.id;
    dto.schoolId = row.schoolId;
    dto.accountNumber = row.accountNumber;
    dto.currency = row.currency;
    dto.balanceDue = row.balanceDue;
    dto.creditBalance = row.creditBalance;
    dto.totalInvoiced = row.totalInvoiced;
    dto.totalPaid = row.totalPaid;
    dto.totalRefunded = row.totalRefunded;
    dto.isActive = row.isActive;
    dto.lastInvoiceAt = row.lastInvoiceAt?.toISOString() ?? null;
    dto.lastPaymentAt = row.lastPaymentAt?.toISOString() ?? null;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export class UpdateBillingProfileDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @Length(1, 255)
  public legalName?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public displayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public contactName?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsEmail() @MaxLength(255)
  public contactEmail?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @IsOptional() @IsString() @MaxLength(40)
  public contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  public ccEmails?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public website?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: BILLING_MAX_NOTES_LENGTH })
  @IsOptional() @IsString() @MaxLength(BILLING_MAX_NOTES_LENGTH)
  public notes?: string | null;
}

export class BillingProfileResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty() public legalName!: string;
  @ApiProperty({ nullable: true }) public displayName!: string | null;
  @ApiProperty({ nullable: true }) public contactName!: string | null;
  @ApiProperty() public contactEmail!: string;
  @ApiProperty({ nullable: true }) public contactPhone!: string | null;
  @ApiProperty({ nullable: true }) public ccEmails!: string | null;
  @ApiProperty({ nullable: true }) public website!: string | null;
  @ApiProperty({ nullable: true }) public notes!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: BillingProfileRow): BillingProfileResponseDto {
    const dto = new BillingProfileResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.legalName = row.legalName;
    dto.displayName = row.displayName;
    dto.contactName = row.contactName;
    dto.contactEmail = row.contactEmail;
    dto.contactPhone = row.contactPhone;
    dto.ccEmails = row.ccEmails;
    dto.website = row.website;
    dto.notes = row.notes;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------
export class UpdateBillingAddressDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @Length(1, 255)
  public addressLine1?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  public addressLine2?: string | null;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @Length(1, 100)
  public city?: string;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional() @IsString() @Length(1, 10)
  public stateCode?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @Length(1, 100)
  public stateName?: string;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional() @IsString() @Length(1, 10)
  public pincode?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2, default: 'IN' })
  @IsOptional() @IsString() @Length(2, 2)
  public countryCode?: string;
}

export class BillingAddressResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty() public addressLine1!: string;
  @ApiProperty({ nullable: true }) public addressLine2!: string | null;
  @ApiProperty() public city!: string;
  @ApiProperty() public stateCode!: string;
  @ApiProperty() public stateName!: string;
  @ApiProperty() public pincode!: string;
  @ApiProperty() public countryCode!: string;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: BillingAddressRow): BillingAddressResponseDto {
    const dto = new BillingAddressResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.addressLine1 = row.addressLine1;
    dto.addressLine2 = row.addressLine2;
    dto.city = row.city;
    dto.stateCode = row.stateCode;
    dto.stateName = row.stateName;
    dto.pincode = row.pincode;
    dto.countryCode = row.countryCode;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}

// ---------------------------------------------------------------------------
// Tax Details
// ---------------------------------------------------------------------------
export class UpdateTaxDetailsDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 15 })
  @IsOptional() @IsString() @MaxLength(15)
  public gstin?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional() @IsString() @MaxLength(10)
  public pan?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10 })
  @IsOptional() @IsString() @MaxLength(10)
  public placeOfSupply?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  public taxExempt?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString() @MaxLength(500)
  public exemptReason?: string | null;
}

export class TaxDetailsResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public accountId!: string;
  @ApiProperty({ nullable: true }) public gstin!: string | null;
  @ApiProperty({ nullable: true }) public pan!: string | null;
  @ApiProperty({ nullable: true }) public placeOfSupply!: string | null;
  @ApiProperty() public taxExempt!: boolean;
  @ApiProperty({ nullable: true }) public exemptReason!: string | null;
  @ApiProperty({ type: String }) public createdAt!: string;
  @ApiProperty({ type: String }) public updatedAt!: string;
  @ApiProperty() public version!: number;

  public static from(row: TaxDetailsRow): TaxDetailsResponseDto {
    const dto = new TaxDetailsResponseDto();
    dto.id = row.id;
    dto.accountId = row.accountId;
    dto.gstin = row.gstin;
    dto.pan = row.pan;
    dto.placeOfSupply = row.placeOfSupply;
    dto.taxExempt = row.taxExempt;
    dto.exemptReason = row.exemptReason;
    dto.createdAt = row.createdAt.toISOString();
    dto.updatedAt = row.updatedAt.toISOString();
    dto.version = row.version;
    return dto;
  }
}
