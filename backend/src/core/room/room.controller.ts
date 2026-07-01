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
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../http/if-match';
import { RequirePermissions } from '../rbac';
import { RoomPermissions } from './room.constants';
import {
  CreateRoomDto,
  CreateRoomTypeDto,
  RoomListQueryDto,
  RoomListResponseDto,
  RoomResponseDto,
  RoomTypeListResponseDto,
  RoomTypeResponseDto,
  UpdateRoomDto,
  UpdateRoomTypeDto,
} from './room.dto';
import { RoomService, RoomTypeService } from './room.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@Controller({ path: 'rooms', version: '1' })
export class RoomController {
  constructor(private readonly service: RoomService) {}

  @Get()
  @RequirePermissions(RoomPermissions.READ)
  @ApiOkResponse({ type: RoomListResponseDto })
  public async list(@Query() query: RoomListQueryDto): Promise<RoomListResponseDto> {
    const items = await this.service.list({
      branchId: query.branchId,
      roomTypeId: query.roomTypeId,
      status: query.status,
    });
    return { items: items.map(RoomResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(RoomPermissions.READ)
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoomResponseDto> {
    return RoomResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(RoomPermissions.CREATE)
  @ApiCreatedResponse({ type: RoomResponseDto })
  public async create(@Body() body: CreateRoomDto): Promise<RoomResponseDto> {
    return RoomResponseDto.from(
      await this.service.create({
        branchId: body.branchId,
        roomTypeId: body.roomTypeId,
        code: body.code,
        name: body.name,
        capacity: body.capacity,
        floor: body.floor,
        block: body.block,
        status: body.status,
        notes: body.notes,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(RoomPermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return RoomResponseDto.from(
      await this.service.update(id, expectedVersion, {
        roomTypeId: body.roomTypeId,
        code: body.code,
        name: body.name,
        capacity: body.capacity,
        floor: body.floor,
        block: body.block,
        status: body.status,
        notes: body.notes,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(RoomPermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}

@ApiTags('Room Types')
@ApiBearerAuth()
@Controller({ path: 'room-types', version: '1' })
export class RoomTypeController {
  constructor(private readonly service: RoomTypeService) {}

  @Get()
  @RequirePermissions(RoomPermissions.TYPE_READ)
  @ApiOkResponse({ type: RoomTypeListResponseDto })
  public async list(): Promise<RoomTypeListResponseDto> {
    const items = await this.service.list();
    return { items: items.map(RoomTypeResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(RoomPermissions.TYPE_READ)
  @ApiOkResponse({ type: RoomTypeResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<RoomTypeResponseDto> {
    return RoomTypeResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(RoomPermissions.TYPE_CREATE)
  @ApiCreatedResponse({ type: RoomTypeResponseDto })
  public async create(@Body() body: CreateRoomTypeDto): Promise<RoomTypeResponseDto> {
    return RoomTypeResponseDto.from(
      await this.service.create({
        code: body.code,
        name: body.name,
        defaultCapacity: body.defaultCapacity,
        allowsExam: body.allowsExam,
        allowsTimetable: body.allowsTimetable,
        description: body.description,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(RoomPermissions.TYPE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: RoomTypeResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateRoomTypeDto,
  ): Promise<RoomTypeResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return RoomTypeResponseDto.from(
      await this.service.update(id, expectedVersion, {
        code: body.code,
        name: body.name,
        defaultCapacity: body.defaultCapacity,
        allowsExam: body.allowsExam,
        allowsTimetable: body.allowsTimetable,
        description: body.description,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(RoomPermissions.TYPE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}
