import { Module } from '@nestjs/common';

import { RoomPermissionsSeeder } from './room-permissions.seeder';
import { RoomController, RoomTypeController } from './room.controller';
import { RoomService, RoomTypeService } from './room.service';
import { RoomTypeRepository } from './repositories/room-type.repository';
import { RoomRepository } from './repositories/room.repository';

@Module({
  controllers: [RoomController, RoomTypeController],
  providers: [
    RoomTypeRepository,
    RoomRepository,
    RoomTypeService,
    RoomService,
    RoomPermissionsSeeder,
  ],
  exports: [RoomService, RoomTypeService, RoomRepository, RoomTypeRepository],
})
export class RoomModule {}
