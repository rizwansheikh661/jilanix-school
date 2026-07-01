import { Module } from '@nestjs/common';

import { CoreModule } from './core/core.module';

/**
 * Composition root.
 *
 * Sprint 1 wires only the CoreModule (Config + Health). Feature modules
 * (Identity, School, Student, ...) will be added here as their sprints land,
 * keeping this file as the single, declarative top-level inventory of the
 * application's modules.
 */
@Module({
  imports: [CoreModule],
})
export class AppModule {}
