/**
 * AdmissionModule — composition root for the Admission domain. Wires
 * the controllers, services, repositories, and permission seeder, and
 * imports `StudentModule` + `ParentModule` so `AdmissionService` can
 * inject `StudentService` / `ParentService` for the APPROVE
 * transaction.
 */
import { Module } from '@nestjs/common';

import { ParentModule } from '../parent';
import { StudentModule } from '../student';
import { AdmissionPermissionsSeeder } from './admission-permissions.seeder';
import { AdmissionController } from './admission/admission.controller';
import { AdmissionService } from './admission/admission.service';
import { AdmissionDocumentController } from './document/admission-document.controller';
import { AdmissionDocumentService } from './document/admission-document.service';
import { AdmissionDocumentRepository } from './repositories/admission-document.repository';
import { AdmissionHistoryRepository } from './repositories/admission-history.repository';
import { AdmissionRepository } from './repositories/admission.repository';

@Module({
  imports: [StudentModule, ParentModule],
  controllers: [AdmissionController, AdmissionDocumentController],
  providers: [
    AdmissionRepository,
    AdmissionDocumentRepository,
    AdmissionHistoryRepository,
    AdmissionService,
    AdmissionDocumentService,
    AdmissionPermissionsSeeder,
  ],
  exports: [AdmissionService],
})
export class AdmissionModule {}
