/**
 * BillingAccountController — platform-admin CRUD over the BillingAccount
 * cluster (BillingAccount + BillingProfile + BillingAddress + TaxDetails).
 *
 * Routes mount under `/v1/platform/billing/accounts[*]`:
 *   GET    /                    — list accounts (cursor-paginated)
 *   GET    /:id                 — read account header
 *   GET    /:id/profile         — read billing profile
 *   GET    /:id/address         — read billing address
 *   GET    /:id/tax-details     — read tax details
 *   POST   /                    — create account + profile + address + tax (one tx)
 *   PATCH  /:id/profile         — update profile (If-Match required)
 *   PATCH  /:id/address         — update address (If-Match required)
 *   PATCH  /:id/tax-details     — update tax details (If-Match required)
 *
 * Feature-flag enforcement (`module.billing`) lives in the service layer
 * via `assertBillingEnabled`. RBAC is decorated per-method.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { BillingPermissions } from '../billing.constants';
import {
  BillingAccountNotFoundError,
  BillingProfileNotFoundError,
} from '../billing.errors';
import {
  BillingAccountResponseDto,
  BillingAddressResponseDto,
  BillingProfileResponseDto,
  CreateBillingAccountDto,
  ListBillingAccountsQueryDto,
  TaxDetailsResponseDto,
  UpdateBillingAddressDto,
  UpdateBillingProfileDto,
  UpdateTaxDetailsDto,
} from './billing-account.dto';
import { BillingAccountService } from './billing-account.service';

interface ListAccountsEnvelope {
  readonly items: readonly BillingAccountResponseDto[];
  readonly nextCursor: string | null;
}

@ApiTags('Platform Admin · Billing Accounts')
@ApiBearerAuth()
@Controller({ path: 'platform/billing/accounts', version: '1' })
export class BillingAccountController {
  constructor(private readonly service: BillingAccountService) {}

  @Get()
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'List billing accounts.' })
  public async list(
    @Query() query: ListBillingAccountsQueryDto,
  ): Promise<ListAccountsEnvelope> {
    const limit = Math.min(
      PAGINATION_MAX_LIMIT,
      Math.max(1, query.limit ?? PAGINATION_DEFAULT_LIMIT),
    );
    const result = await this.service.listAccounts({
      limit,
      ...(query.cursorId !== undefined ? { cursorId: query.cursorId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    });
    return {
      items: result.items.map(BillingAccountResponseDto.from),
      nextCursor: result.nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'Read a billing account by id.' })
  @ApiOkResponse({ type: BillingAccountResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BillingAccountResponseDto> {
    return BillingAccountResponseDto.from(await this.service.getAccount(id));
  }

  @Get(':id/profile')
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'Read the billing profile for an account.' })
  @ApiOkResponse({ type: BillingProfileResponseDto })
  public async getProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BillingProfileResponseDto> {
    const row = await this.service.getProfile(id);
    if (row === null) throw new BillingProfileNotFoundError(id);
    return BillingProfileResponseDto.from(row);
  }

  @Get(':id/address')
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'Read the billing address for an account.' })
  @ApiOkResponse({ type: BillingAddressResponseDto })
  public async getAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BillingAddressResponseDto> {
    const row = await this.service.getAddress(id);
    if (row === null) throw new BillingAccountNotFoundError(id);
    return BillingAddressResponseDto.from(row);
  }

  @Get(':id/tax-details')
  @RequirePermissions(BillingPermissions.ACCOUNT_READ)
  @ApiOperation({ summary: 'Read the tax details for an account.' })
  @ApiOkResponse({ type: TaxDetailsResponseDto })
  public async getTaxDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TaxDetailsResponseDto> {
    const row = await this.service.getTaxDetails(id);
    if (row === null) throw new BillingAccountNotFoundError(id);
    return TaxDetailsResponseDto.from(row);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(BillingPermissions.ACCOUNT_MANAGE)
  @ApiOperation({
    summary: 'Create a billing account with profile + address + tax details (one tx).',
  })
  @ApiOkResponse({ type: BillingAccountResponseDto })
  public async create(
    @Body() body: CreateBillingAccountDto,
  ): Promise<BillingAccountResponseDto> {
    const result = await this.service.createAccount({
      schoolId: body.schoolId,
      profile: { ...body.profile },
      address: { ...body.address },
      taxDetails: { ...body.taxDetails },
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
    });
    return BillingAccountResponseDto.from(result.account);
  }

  @Patch(':id/profile')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.ACCOUNT_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update the billing profile.' })
  @ApiOkResponse({ type: BillingProfileResponseDto })
  public async updateProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBillingProfileDto,
  ): Promise<BillingProfileResponseDto> {
    const updated = await this.service.updateProfile(
      id,
      parseIfMatch(ifMatch),
      { ...body },
    );
    return BillingProfileResponseDto.from(updated);
  }

  @Patch(':id/address')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.ACCOUNT_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update the billing address.' })
  @ApiOkResponse({ type: BillingAddressResponseDto })
  public async updateAddress(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBillingAddressDto,
  ): Promise<BillingAddressResponseDto> {
    const updated = await this.service.updateAddress(
      id,
      parseIfMatch(ifMatch),
      { ...body },
    );
    return BillingAddressResponseDto.from(updated);
  }

  @Patch(':id/tax-details')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(BillingPermissions.ACCOUNT_MANAGE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Update the tax details.' })
  @ApiOkResponse({ type: TaxDetailsResponseDto })
  public async updateTaxDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTaxDetailsDto,
  ): Promise<TaxDetailsResponseDto> {
    const updated = await this.service.updateTaxDetails(
      id,
      parseIfMatch(ifMatch),
      { ...body },
    );
    return TaxDetailsResponseDto.from(updated);
  }
}
