/**
 * SequencesModule — composition root for the per-tenant counter catalog.
 *
 * Exports `SequenceService` so domain modules (Staff, Admission, Fees in
 * later sprints) can inject it without dragging in the repository or the
 * controller.
 */
import { Module } from '@nestjs/common';

import { TenantSequenceRepository } from './repositories/tenant-sequence.repository';
import { SequenceController } from './sequence/sequence.controller';
import { SequenceService } from './sequence/sequence.service';
import { SequencesPermissionsSeeder } from './sequences-permissions.seeder';

@Module({
  controllers: [SequenceController],
  providers: [
    TenantSequenceRepository,
    SequenceService,
    SequencesPermissionsSeeder,
  ],
  exports: [SequenceService],
})
export class SequencesModule {}
