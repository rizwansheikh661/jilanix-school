/**
 * BillingAccountRepository — persistence for the 1:1 cluster of billing-account
 * tables (BillingAccount + BillingProfile + BillingAddress + TaxDetails).
 *
 * Sprint 20 — all entities are PLATFORM_ONLY. Multi-tenant filtering is by
 * `schoolId` column only. The BYPASS_TENANT_SCOPE annotation is present for
 * consistency with the SaaS-side repositories so future tenant-scope hardening
 * can drop in without rework.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import { BILLING_DEFAULT_CURRENCY } from '../billing.constants';
import {
  toNumber,
  type BillingAccountRow,
  type BillingAddressRow,
  type BillingProfileRow,
  type TaxDetailsRow,
} from '../billing.types';

const BYPASS_TENANT_SCOPE = Object.freeze({
  __schoolosCtx: Object.freeze({
    bypassTenantScope: Object.freeze({ reason: 'platform billing op' }),
  }),
});

export interface CreateBillingAccountInput {
  readonly schoolId: string;
  readonly accountNumber: string;
  readonly currency?: string;
  readonly isActive?: boolean;
}

export interface UpdateBillingAccountInput {
  readonly currency?: string;
  readonly isActive?: boolean;
}

export interface IncrementBillingAccountInput {
  readonly balanceDue?: number;
  readonly creditBalance?: number;
  readonly totalInvoiced?: number;
  readonly totalPaid?: number;
  readonly totalRefunded?: number;
  readonly lastInvoiceAt?: Date | null;
  readonly lastPaymentAt?: Date | null;
}

export interface ListBillingAccountsArgs {
  readonly limit: number;
  readonly cursorId?: string;
  readonly isActive?: boolean;
}

export interface UpsertBillingProfileInput {
  readonly legalName: string;
  readonly displayName?: string | null;
  readonly contactName?: string | null;
  readonly contactEmail: string;
  readonly contactPhone?: string | null;
  readonly ccEmails?: string | null;
  readonly website?: string | null;
  readonly notes?: string | null;
}

export interface UpdateBillingProfileInput {
  readonly legalName?: string;
  readonly displayName?: string | null;
  readonly contactName?: string | null;
  readonly contactEmail?: string;
  readonly contactPhone?: string | null;
  readonly ccEmails?: string | null;
  readonly website?: string | null;
  readonly notes?: string | null;
}

export interface UpsertBillingAddressInput {
  readonly addressLine1: string;
  readonly addressLine2?: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly stateName: string;
  readonly pincode: string;
  readonly countryCode?: string;
}

export interface UpdateBillingAddressInput {
  readonly addressLine1?: string;
  readonly addressLine2?: string | null;
  readonly city?: string;
  readonly stateCode?: string;
  readonly stateName?: string;
  readonly pincode?: string;
  readonly countryCode?: string;
}

export interface UpsertTaxDetailsInput {
  readonly gstin?: string | null;
  readonly pan?: string | null;
  readonly placeOfSupply?: string | null;
  readonly taxExempt?: boolean;
  readonly exemptReason?: string | null;
}

export interface UpdateTaxDetailsInput {
  readonly gstin?: string | null;
  readonly pan?: string | null;
  readonly placeOfSupply?: string | null;
  readonly taxExempt?: boolean;
  readonly exemptReason?: string | null;
}

@Injectable()
export class BillingAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private currentUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  // -------------------------------------------------------------------------
  // BillingAccount
  // -------------------------------------------------------------------------
  public async findById(id: string, tx?: PrismaTx): Promise<BillingAccountRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingAccount.findFirst({
      where: { id, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapAccount(row as RawAccount);
  }

  public async findBySchoolId(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<BillingAccountRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingAccount.findFirst({
      where: { schoolId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapAccount(row as RawAccount);
  }

  public async list(
    args: ListBillingAccountsArgs,
    tx?: PrismaTx,
  ): Promise<{ readonly rows: readonly BillingAccountRow[]; readonly nextCursorId: string | null }> {
    const reader = this.resolve(tx);
    const where: Record<string, unknown> = { deletedAt: null };
    if (args.isActive !== undefined) where.isActive = args.isActive;
    const rows = await reader.billingAccount.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { id: args.cursorId }, skip: 1 }
        : {}),
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursorId = hasMore && last !== undefined ? (last as { id: string }).id : null;
    return {
      rows: trimmed.map((r) => mapAccount(r as RawAccount)),
      nextCursorId,
    };
  }

  public async createAccount(
    input: CreateBillingAccountInput,
    tx?: PrismaTx,
  ): Promise<BillingAccountRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const created = await writer.billingAccount.create({
      data: {
        id: randomUUID(),
        schoolId: input.schoolId,
        accountNumber: input.accountNumber,
        currency: input.currency ?? BILLING_DEFAULT_CURRENCY,
        isActive: input.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      } as never,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapAccount(created as RawAccount);
  }

  public async updateAccount(
    id: string,
    expectedVersion: number,
    patch: UpdateBillingAccountInput,
    tx?: PrismaTx,
  ): Promise<BillingAccountRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    const result = await writer.billingAccount.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('BillingAccount', id, expectedVersion);
    }
    const reloaded = await writer.billingAccount.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('BillingAccount', id, expectedVersion);
    }
    return mapAccount(reloaded as RawAccount);
  }

  public async softDeleteAccount(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const result = await writer.billingAccount.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('BillingAccount', id, expectedVersion);
    }
  }

  /**
   * Atomic increment of running-balance counters. Does NOT bump `version`
   * because money mutations are driven by invoice/payment events and would
   * lose to user-driven optimistic updates if version-guarded.
   */
  public async incrementBalances(
    id: string,
    patch: IncrementBillingAccountInput,
    tx?: PrismaTx,
  ): Promise<BillingAccountRow> {
    const writer = this.resolve(tx);
    const data: Record<string, unknown> = {};
    if (patch.balanceDue !== undefined && patch.balanceDue !== 0) {
      data.balanceDue = { increment: patch.balanceDue };
    }
    if (patch.creditBalance !== undefined && patch.creditBalance !== 0) {
      data.creditBalance = { increment: patch.creditBalance };
    }
    if (patch.totalInvoiced !== undefined && patch.totalInvoiced !== 0) {
      data.totalInvoiced = { increment: patch.totalInvoiced };
    }
    if (patch.totalPaid !== undefined && patch.totalPaid !== 0) {
      data.totalPaid = { increment: patch.totalPaid };
    }
    if (patch.totalRefunded !== undefined && patch.totalRefunded !== 0) {
      data.totalRefunded = { increment: patch.totalRefunded };
    }
    if (patch.lastInvoiceAt !== undefined) data.lastInvoiceAt = patch.lastInvoiceAt;
    if (patch.lastPaymentAt !== undefined) data.lastPaymentAt = patch.lastPaymentAt;

    const updated = await writer.billingAccount.update({
      where: { id },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapAccount(updated as RawAccount);
  }

  // -------------------------------------------------------------------------
  // BillingProfile
  // -------------------------------------------------------------------------
  public async findProfile(
    accountId: string,
    tx?: PrismaTx,
  ): Promise<BillingProfileRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingProfile.findFirst({
      where: { accountId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapProfile(row as RawProfile);
  }

  public async upsertProfile(
    accountId: string,
    input: UpsertBillingProfileInput,
    tx?: PrismaTx,
  ): Promise<BillingProfileRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const existing = await writer.billingProfile.findFirst({
      where: { accountId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (existing === null) {
      const created = await writer.billingProfile.create({
        data: {
          id: randomUUID(),
          accountId,
          legalName: input.legalName,
          displayName: input.displayName ?? null,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          ccEmails: input.ccEmails ?? null,
          website: input.website ?? null,
          notes: input.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        } as never,
        ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
      });
      return mapProfile(created as RawProfile);
    }
    // Resurrect if soft-deleted
    const updated = await writer.billingProfile.update({
      where: { id: (existing as { id: string }).id },
      data: {
        legalName: input.legalName,
        displayName: input.displayName ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        ccEmails: input.ccEmails ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        deletedAt: null,
        deletedBy: null,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapProfile(updated as RawProfile);
  }

  public async updateProfile(
    id: string,
    expectedVersion: number,
    patch: UpdateBillingProfileInput,
    tx?: PrismaTx,
  ): Promise<BillingProfileRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    const fields: ReadonlyArray<keyof UpdateBillingProfileInput> = [
      'legalName',
      'displayName',
      'contactName',
      'contactEmail',
      'contactPhone',
      'ccEmails',
      'website',
      'notes',
    ];
    for (const k of fields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.billingProfile.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('BillingProfile', id, expectedVersion);
    }
    const reloaded = await writer.billingProfile.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('BillingProfile', id, expectedVersion);
    }
    return mapProfile(reloaded as RawProfile);
  }

  // -------------------------------------------------------------------------
  // BillingAddress
  // -------------------------------------------------------------------------
  public async findAddress(
    accountId: string,
    tx?: PrismaTx,
  ): Promise<BillingAddressRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.billingAddress.findFirst({
      where: { accountId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapAddress(row as RawAddress);
  }

  public async upsertAddress(
    accountId: string,
    input: UpsertBillingAddressInput,
    tx?: PrismaTx,
  ): Promise<BillingAddressRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const existing = await writer.billingAddress.findFirst({
      where: { accountId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (existing === null) {
      const created = await writer.billingAddress.create({
        data: {
          id: randomUUID(),
          accountId,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          stateCode: input.stateCode,
          stateName: input.stateName,
          pincode: input.pincode,
          countryCode: input.countryCode ?? 'IN',
          createdBy: userId,
          updatedBy: userId,
        } as never,
        ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
      });
      return mapAddress(created as RawAddress);
    }
    const updated = await writer.billingAddress.update({
      where: { id: (existing as { id: string }).id },
      data: {
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        stateCode: input.stateCode,
        stateName: input.stateName,
        pincode: input.pincode,
        countryCode: input.countryCode ?? 'IN',
        deletedAt: null,
        deletedBy: null,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapAddress(updated as RawAddress);
  }

  public async updateAddress(
    id: string,
    expectedVersion: number,
    patch: UpdateBillingAddressInput,
    tx?: PrismaTx,
  ): Promise<BillingAddressRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    const fields: ReadonlyArray<keyof UpdateBillingAddressInput> = [
      'addressLine1',
      'addressLine2',
      'city',
      'stateCode',
      'stateName',
      'pincode',
      'countryCode',
    ];
    for (const k of fields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.billingAddress.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('BillingAddress', id, expectedVersion);
    }
    const reloaded = await writer.billingAddress.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('BillingAddress', id, expectedVersion);
    }
    return mapAddress(reloaded as RawAddress);
  }

  // -------------------------------------------------------------------------
  // TaxDetails
  // -------------------------------------------------------------------------
  public async findTax(
    accountId: string,
    tx?: PrismaTx,
  ): Promise<TaxDetailsRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.taxDetails.findFirst({
      where: { accountId, deletedAt: null },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return row === null ? null : mapTax(row as RawTax);
  }

  public async upsertTax(
    accountId: string,
    input: UpsertTaxDetailsInput,
    tx?: PrismaTx,
  ): Promise<TaxDetailsRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const existing = await writer.taxDetails.findFirst({
      where: { accountId },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (existing === null) {
      const created = await writer.taxDetails.create({
        data: {
          id: randomUUID(),
          accountId,
          gstin: input.gstin ?? null,
          pan: input.pan ?? null,
          placeOfSupply: input.placeOfSupply ?? null,
          taxExempt: input.taxExempt ?? false,
          exemptReason: input.exemptReason ?? null,
          createdBy: userId,
          updatedBy: userId,
        } as never,
        ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
      });
      return mapTax(created as RawTax);
    }
    const updated = await writer.taxDetails.update({
      where: { id: (existing as { id: string }).id },
      data: {
        gstin: input.gstin ?? null,
        pan: input.pan ?? null,
        placeOfSupply: input.placeOfSupply ?? null,
        taxExempt: input.taxExempt ?? false,
        exemptReason: input.exemptReason ?? null,
        deletedAt: null,
        deletedBy: null,
        version: { increment: 1 },
        updatedBy: userId,
      },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    return mapTax(updated as RawTax);
  }

  public async updateTax(
    id: string,
    expectedVersion: number,
    patch: UpdateTaxDetailsInput,
    tx?: PrismaTx,
  ): Promise<TaxDetailsRow> {
    const writer = this.resolve(tx);
    const userId = this.currentUserId();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId,
    };
    const fields: ReadonlyArray<keyof UpdateTaxDetailsInput> = [
      'gstin',
      'pan',
      'placeOfSupply',
      'taxExempt',
      'exemptReason',
    ];
    for (const k of fields) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    const result = await writer.taxDetails.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data,
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (result.count === 0) {
      throw new VersionConflictError('TaxDetails', id, expectedVersion);
    }
    const reloaded = await writer.taxDetails.findUnique({
      where: { id },
      ...(BYPASS_TENANT_SCOPE as Record<string, unknown>),
    });
    if (reloaded === null) {
      throw new VersionConflictError('TaxDetails', id, expectedVersion);
    }
    return mapTax(reloaded as RawTax);
  }
}

// ---------------------------------------------------------------------------
// Raw shapes + row mappers
// ---------------------------------------------------------------------------
interface RawAccount {
  id: string;
  schoolId: string;
  accountNumber: string;
  currency: string;
  balanceDue: unknown;
  creditBalance: unknown;
  totalInvoiced: unknown;
  totalPaid: unknown;
  totalRefunded: unknown;
  isActive: boolean;
  lastInvoiceAt: Date | null;
  lastPaymentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawProfile {
  id: string;
  accountId: string;
  legalName: string;
  displayName: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  ccEmails: string | null;
  website: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawAddress {
  id: string;
  accountId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  stateName: string;
  pincode: string;
  countryCode: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface RawTax {
  id: string;
  accountId: string;
  gstin: string | null;
  pan: string | null;
  placeOfSupply: string | null;
  taxExempt: boolean;
  exemptReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

function mapAccount(row: RawAccount): BillingAccountRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    accountNumber: row.accountNumber,
    currency: row.currency,
    balanceDue: toNumber(row.balanceDue),
    creditBalance: toNumber(row.creditBalance),
    totalInvoiced: toNumber(row.totalInvoiced),
    totalPaid: toNumber(row.totalPaid),
    totalRefunded: toNumber(row.totalRefunded),
    isActive: row.isActive,
    lastInvoiceAt: row.lastInvoiceAt,
    lastPaymentAt: row.lastPaymentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapProfile(row: RawProfile): BillingProfileRow {
  return {
    id: row.id,
    accountId: row.accountId,
    legalName: row.legalName,
    displayName: row.displayName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    ccEmails: row.ccEmails,
    website: row.website,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapAddress(row: RawAddress): BillingAddressRow {
  return {
    id: row.id,
    accountId: row.accountId,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateCode: row.stateCode,
    stateName: row.stateName,
    pincode: row.pincode,
    countryCode: row.countryCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapTax(row: RawTax): TaxDetailsRow {
  return {
    id: row.id,
    accountId: row.accountId,
    gstin: row.gstin,
    pan: row.pan,
    placeOfSupply: row.placeOfSupply,
    taxExempt: row.taxExempt,
    exemptReason: row.exemptReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
