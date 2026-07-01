import { Module } from '@nestjs/common';

import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { JobDeadLetterController } from './job-dead-letter/job-dead-letter.controller';
import { JobDefinitionController } from './job-definition/job-definition.controller';
import { JobRunController } from './job-run/job-run.controller';
import { JobsPermissionsSeeder } from './jobs-permissions.seeder';
import {
  JobDeadLetterService,
  JobDefinitionService,
  JobRunService,
} from './jobs.service';
import { JobClaimRepository } from './repositories/job-claim.repository';
import { JobDeadLetterRepository } from './repositories/job-dead-letter.repository';
import { JobDefinitionRepository } from './repositories/job-definition.repository';
import { JobRunRepository } from './repositories/job-run.repository';
import { JobEnqueueService } from './services/job-enqueue.service';
import { JobProcessorService } from './services/job-processor.service';
import { JobRunRecorderService } from './services/job-run-recorder.service';
import { JobSchedulerService } from './services/job-scheduler.service';

@Module({
  controllers: [JobDefinitionController, JobRunController, JobDeadLetterController],
  providers: [
    JobDefinitionRepository,
    JobRunRepository,
    JobDeadLetterRepository,
    JobClaimRepository,
    JobHandlerRegistry,
    JobEnqueueService,
    JobRunRecorderService,
    JobProcessorService,
    JobSchedulerService,
    JobDefinitionService,
    JobRunService,
    JobDeadLetterService,
    JobsPermissionsSeeder,
  ],
  exports: [
    JobEnqueueService,
    JobHandlerRegistry,
    JobProcessorService,
    JobSchedulerService,
    JobDeadLetterRepository,
    // Sprint 14.1 — exported so module-level scheduler bootstraps can
    // upsert JobDefinition rows for cross-tenant recurring jobs.
    JobDefinitionRepository,
  ],
})
export class JobsModule {}
