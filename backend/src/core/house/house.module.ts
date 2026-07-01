import { Module } from '@nestjs/common';

import { HousePermissionsSeeder } from './house-permissions.seeder';
import {
  HouseAssignmentController,
  HouseController,
  StudentHouseAssignmentController,
} from './house.controller';
import { HouseAssignmentService, HouseService } from './house.service';
import {
  HouseAssignmentRepository,
  HouseRepository,
} from './repositories/house.repositories';

@Module({
  controllers: [HouseController, HouseAssignmentController, StudentHouseAssignmentController],
  providers: [
    HouseRepository,
    HouseAssignmentRepository,
    HouseService,
    HouseAssignmentService,
    HousePermissionsSeeder,
  ],
  exports: [HouseService, HouseAssignmentService, HouseRepository, HouseAssignmentRepository],
})
export class HouseModule {}
