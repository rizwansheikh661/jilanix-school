import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';
import { VersionController } from './version.controller';

@Module({
  controllers: [HealthController, ReadyController, VersionController],
})
export class HealthModule {}
