import { Global, Module } from '@nestjs/common';

import { ConfigService } from './config.service';

/**
 * Global ConfigModule.
 *
 * `ConfigService.bootstrap()` MUST be called from `apps/api/main.ts` BEFORE
 * `NestFactory.create()` so that any module relying on configuration during
 * initialisation (LoggerModule, PrismaModule, AuthModule, ...) receives a
 * fully-validated snapshot.
 *
 * This module simply exposes that singleton through Nest's DI container.
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
