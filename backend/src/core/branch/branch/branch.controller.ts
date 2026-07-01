import {
  Body,
  Controller,
  Delete,
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
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { BranchPermissions } from '../branch.constants';
import {
  BranchListQueryDto,
  BranchListResponseDto,
  BranchResponseDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './branch.dto';
import { BranchService } from './branch.service';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller({ path: 'branches', version: '1' })
export class BranchController {
  constructor(private readonly service: BranchService) {}

  @Get()
  @RequirePermissions(BranchPermissions.READ)
  @ApiOperation({ summary: 'List branches.' })
  @ApiOkResponse({ type: BranchListResponseDto })
  public async list(@Query() query: BranchListQueryDto): Promise<BranchListResponseDto> {
    const items = await this.service.list({ status: query.status, parentBranchId: query.parentBranchId });
    return { items: items.map(BranchResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(BranchPermissions.READ)
  @ApiOperation({ summary: 'Read a branch.' })
  @ApiOkResponse({ type: BranchResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<BranchResponseDto> {
    return BranchResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(BranchPermissions.CREATE)
  @ApiOperation({ summary: 'Create a branch.' })
  @ApiCreatedResponse({ type: BranchResponseDto })
  public async create(@Body() body: CreateBranchDto): Promise<BranchResponseDto> {
    return BranchResponseDto.from(
      await this.service.create({
        parentBranchId: body.parentBranchId,
        code: body.code,
        name: body.name,
        isPrimary: body.isPrimary,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        stateCode: body.stateCode,
        pincode: body.pincode,
        phone: body.phone,
        email: body.email,
        establishedDate: body.establishedDate === undefined
          ? undefined
          : body.establishedDate === null
            ? null
            : new Date(body.establishedDate),
        managerStaffId: body.managerStaffId,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(BranchPermissions.UPDATE)
  @ApiOperation({ summary: 'Update a branch.' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: BranchResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateBranchDto,
  ): Promise<BranchResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return BranchResponseDto.from(
      await this.service.update(id, expectedVersion, {
        parentBranchId: body.parentBranchId,
        code: body.code,
        name: body.name,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        stateCode: body.stateCode,
        pincode: body.pincode,
        phone: body.phone,
        email: body.email,
        establishedDate: body.establishedDate === undefined
          ? undefined
          : body.establishedDate === null
            ? null
            : new Date(body.establishedDate),
        managerStaffId: body.managerStaffId,
      }),
    );
  }

  @Post(':id/activate')
  @RequirePermissions(BranchPermissions.ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Activate a branch.' })
  @ApiOkResponse({ type: BranchResponseDto })
  public async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<BranchResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return BranchResponseDto.from(await this.service.activate(id, expectedVersion));
  }

  @Post(':id/deactivate')
  @RequirePermissions(BranchPermissions.DEACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Deactivate a branch.' })
  @ApiOkResponse({ type: BranchResponseDto })
  public async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<BranchResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return BranchResponseDto.from(await this.service.deactivate(id, expectedVersion));
  }

  @Post(':id/set-primary')
  @RequirePermissions(BranchPermissions.SET_PRIMARY)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Promote a branch to primary.' })
  @ApiOkResponse({ type: BranchResponseDto })
  public async setPrimary(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<BranchResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return BranchResponseDto.from(await this.service.setPrimary(id, expectedVersion));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(BranchPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Delete a branch.' })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}
