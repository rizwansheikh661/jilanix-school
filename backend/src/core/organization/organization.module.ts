import { Module } from '@nestjs/common';

import { DepartmentController, DesignationController } from './organization.controller';
import { OrganizationPermissionsSeeder } from './organization-permissions.seeder';
import { DepartmentService, DesignationService } from './organization.service';
import { DepartmentRepository } from './repositories/department.repository';
import { DesignationRepository } from './repositories/designation.repository';

@Module({
  controllers: [DepartmentController, DesignationController],
  providers: [
    DepartmentRepository,
    DesignationRepository,
    DepartmentService,
    DesignationService,
    OrganizationPermissionsSeeder,
  ],
  exports: [DepartmentService, DesignationService, DepartmentRepository, DesignationRepository],
})
export class OrganizationModule {}
