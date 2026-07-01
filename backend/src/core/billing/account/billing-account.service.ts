/**
 * BillingAccountService — orchestrator for the 1:1 cluster of BillingAccount +
 * BillingProfile + BillingAddress + TaxDetails + BillingSettings rows.
 *
 * All mutations:
 *   - Gated by `module.billing` feature flag.
 *   - Wrapped in a single PrismaTx so the cluster stays internally consistent.
 *   - Bump optimistic-concurrency `version` on the touched row.
 *   - Publish a billing outbox event in the same tx.
 *   - Append a tenancy-category audit row in the same tx.
 *
 * `createAccount` is the only entry point that allocates an `accountNumber`
 * (BA-<seq>) via SequenceService. The seq is consumed inside the tx so an
 * aborted create rolls the counter back.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import { SequenceService } from '../../sequences/sequence/sequence.service';
import { SEQ_NAMES } from '../../sequences/sequences.constants';
import { BillingOutboxTopics } from '../billing.constants';
import {
  BillingAccountAlreadyExistsError,
  BillingAccountNotFoundError,
} from '../billing.errors';
import {
  assertBillingEnabled,
  formatAccountNumber,
} from '../billing.shared';
import type {
  BillingAccountRow,
  BillingAddressRow,
  BillingProfileRow,
  TaxDetailsRow,
} from '../billing.types';
import {
  BillingAccountRepository,
  type IncrementBillingAccountInput,
  type ListBillingAccountsArgs,
  type UpdateBillingAddressInput,
  type UpdateBillingProfileInput,
  type UpdateTaxDetailsInput,
  type UpsertBillingAddressInput,
  type UpsertBillingProfileInput,
  type UpsertTaxDetailsInput,
} from './billing-account.repository';
import {
  BillingSettingsRepository,
  type CreateBillingSettingsInput,
} from '../settings/billing-settings.repository';

export interface CreateBillingAccountArgs {
  readonly schoolId: string;
  readonly profile: UpsertBillingProfileInput;
  readonly address: UpsertBillingAddressInput;
  readonly taxDetails: UpsertTaxDetailsInput;
  readonly settings?: Omit<CreateBillingSettingsInput, 'accountId' | 'schoolId'>;
  readonly currency?: string;
}

export interface CreateBillingAccountResult {
  readonly account: BillingAccountRow;
  readonly profile: BillingProfileRow;
  readonly address: BillingAddressRow;
  readonly taxDetails: TaxDetailsRow;
}

@Injectable()
export class BillingAccountService {
  private readonly logger = new Logger(BillingAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BillingAccountRepository,
    private readonly settingsRepo: BillingSettingsRepository,
    private readonly sequences: SequenceService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public async getAccount(id: string): Promise<BillingAccountRow> {
    const row = await this.repo.findById(id);
    if (row === null) throw new BillingAccountNotFoundError(id);
    return row;
  }

  public async getAccountBySchoolId(schoolId: string): Promise<BillingAccountRow> {
    const row = await this.repo.findBySchoolId(schoolId);
    if (row === null) throw new BillingAccountNotFoundError(schoolId);
    return row;
  }

  public async findAccountBySchoolId(
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<BillingAccountRow | null> {
    return this.repo.findBySchoolId(schoolId, tx);
  }

  public async listAccounts(query: ListBillingAccountsArgs): Promise<{
    readonly items: readonly BillingAccountRow[];
    readonly nextCursorId: string | null;
  }> {
    const result = await this.repo.list(query);
    return { items: result.rows, nextCursorId: result.nextCursorId };
  }

  public async getProfile(accountId: string): Promise<BillingProfileRow | null> {
    return this.repo.findProfile(accountId);
  }

  public async getAddress(accountId: string): Promise<BillingAddressRow | null> {
    return this.repo.findAddress(accountId);
  }

  public async getTaxDetails(accountId: string): Promise<TaxDetailsRow | null> {
    return this.repo.findTax(accountId);
  }

  /**
   * Internal helper — used by Invoice/Payment/Refund services to push the
   * running balance counters atomically within their tx.
   */
  public async incrementBalances(
    accountId: string,
    patch: IncrementBillingAccountInput,
    tx: PrismaTx,
  ): Promise<BillingAccountRow> {
    return this.repo.incrementBalances(accountId, patch, tx);
  }

  // -------------------------------------------------------------------------
  // createAccount — single tx that creates account + profile + address +
  // tax + settings (defaults from constants).
  // -------------------------------------------------------------------------

  public async createAccount(
    args: CreateBillingAccountArgs,
  ): Promise<CreateBillingAccountResult> {
    await assertBillingEnabled(this.featureFlags, args.schoolId);

    // Idempotency guard outside the tx — cheap pre-check; the unique index
    // on schoolId still protects us on race.
    const existing = await this.repo.findBySchoolId(args.schoolId);
    if (existing !== null) {
      throw new BillingAccountAlreadyExistsError(args.schoolId);
    }

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const seq = await this.sequences.nextValue(SEQ_NAMES.BILLING_ACCOUNT, { tx });
      const accountNumber = formatAccountNumber(seq);

      const accountInput =
        args.currency !== undefined
          ? { schoolId: args.schoolId, accountNumber, currency: args.currency }
          : { schoolId: args.schoolId, accountNumber };
      const account = await this.repo.createAccount(accountInput, tx);
      const profile = await this.repo.upsertProfile(account.id, args.profile, tx);
      const address = await this.repo.upsertAddress(account.id, args.address, tx);
      const taxDetails = await this.repo.upsertTax(account.id, args.taxDetails, tx);
      await this.settingsRepo.create(
        {
          ...(args.settings ?? {}),
          accountId: account.id,
          schoolId: account.schoolId,
        },
        tx,
      );

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.ACCOUNT_CREATED,
        eventType: 'BillingAccountCreated',
        aggregateType: 'BillingAccount',
        aggregateId: account.id,
        schoolId: account.schoolId,
        payload: {
          accountId: account.id,
          schoolId: account.schoolId,
          accountNumber: account.accountNumber,
          currency: account.currency,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.account.created',
          category: 'tenancy',
          resourceType: 'BillingAccount',
          resourceId: account.id,
          schoolId: account.schoolId,
          after: {
            id: account.id,
            schoolId: account.schoolId,
            accountNumber: account.accountNumber,
            currency: account.currency,
            profileId: profile.id,
            addressId: address.id,
            taxDetailsId: taxDetails.id,
          },
        },
        { tx: tx as unknown as AuditTxLike },
      );

      this.logger.log(
        `BillingAccount created id=${account.id} schoolId=${account.schoolId} number=${account.accountNumber}.`,
      );
      return { account, profile, address, taxDetails };
    });
  }

  // -------------------------------------------------------------------------
  // Profile / Address / Tax updates — each emits its own audit + outbox
  // -------------------------------------------------------------------------

  public async updateProfile(
    accountId: string,
    expectedVersion: number,
    patch: UpdateBillingProfileInput,
  ): Promise<BillingProfileRow> {
    const account = await this.repo.findById(accountId);
    if (account === null) throw new BillingAccountNotFoundError(accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findProfile(accountId, tx);
      if (existing === null) throw new BillingAccountNotFoundError(accountId);
      const updated = await this.repo.updateProfile(existing.id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.ACCOUNT_CREATED,
        eventType: 'BillingProfileUpdated',
        aggregateType: 'BillingProfile',
        aggregateId: updated.id,
        schoolId: account.schoolId,
        payload: {
          accountId,
          profileId: updated.id,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.profile.updated',
          category: 'tenancy',
          resourceType: 'BillingProfile',
          resourceId: updated.id,
          schoolId: account.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async updateAddress(
    accountId: string,
    expectedVersion: number,
    patch: UpdateBillingAddressInput,
  ): Promise<BillingAddressRow> {
    const account = await this.repo.findById(accountId);
    if (account === null) throw new BillingAccountNotFoundError(accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findAddress(accountId, tx);
      if (existing === null) throw new BillingAccountNotFoundError(accountId);
      const updated = await this.repo.updateAddress(existing.id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.ACCOUNT_CREATED,
        eventType: 'BillingAddressUpdated',
        aggregateType: 'BillingAddress',
        aggregateId: updated.id,
        schoolId: account.schoolId,
        payload: {
          accountId,
          addressId: updated.id,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.address.updated',
          category: 'tenancy',
          resourceType: 'BillingAddress',
          resourceId: updated.id,
          schoolId: account.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  public async updateTaxDetails(
    accountId: string,
    expectedVersion: number,
    patch: UpdateTaxDetailsInput,
  ): Promise<TaxDetailsRow> {
    const account = await this.repo.findById(accountId);
    if (account === null) throw new BillingAccountNotFoundError(accountId);
    await assertBillingEnabled(this.featureFlags, account.schoolId);

    return this.prisma.client.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const existing = await this.repo.findTax(accountId, tx);
      if (existing === null) throw new BillingAccountNotFoundError(accountId);
      const updated = await this.repo.updateTax(existing.id, expectedVersion, patch, tx);

      await this.outbox.publish(tx, {
        topic: BillingOutboxTopics.ACCOUNT_CREATED,
        eventType: 'BillingTaxDetailsUpdated',
        aggregateType: 'TaxDetails',
        aggregateId: updated.id,
        schoolId: account.schoolId,
        payload: {
          accountId,
          taxDetailsId: updated.id,
        } as unknown as Prisma.InputJsonValue,
      });
      await this.audit.record(
        {
          action: 'billing.tax_details.updated',
          category: 'tenancy',
          resourceType: 'TaxDetails',
          resourceId: updated.id,
          schoolId: account.schoolId,
          before: existing,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Internal — actor info helper (kept around for consumers wiring guards)
  // -------------------------------------------------------------------------
  private currentActorUserId(): string | null {
    return RequestContextRegistry.peek()?.userId ?? null;
  }

  /** Kept live for downstream callers wiring `incrementBalances` ops. */
  public readonly _internalActorIdForTests = () => this.currentActorUserId();
}
