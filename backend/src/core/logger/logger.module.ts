/**
 * LoggerModule — wraps `nestjs-pino`'s `LoggerModule.forRootAsync` so the
 * rest of the app injects:
 *
 *   - `Logger` from `nestjs-pino`        — Nest-compatible logger interface;
 *                                           use this in `app.useLogger(...)`
 *                                           so framework messages are emitted
 *                                           through pino.
 *   - `PinoLogger` from `nestjs-pino`    — raw pino interface for advanced
 *                                           callers.
 *   - `AppLogger` (this package)         — context-enriched wrapper that
 *                                           pulls request_id/tenant_id/etc.
 *                                           from AsyncLocalStorage.
 *
 * Wiring order in `main.ts`:
 *
 *   const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *   app.useLogger(app.get(Logger));
 *
 * `bufferLogs: true` is essential — Nest buffers any early framework logs
 * and replays them through pino once `useLogger` is called, so we never
 * silently drop bootstrap diagnostics.
 */
import { Global, Module } from '@nestjs/common';
import { LoggerModule as NestjsPinoModule } from 'nestjs-pino';

import { ConfigModule, ConfigService } from '../config';
import { AppLogger } from './logger.service';
import { buildPinoParams } from './pino-options.factory';

@Global()
@Module({
  imports: [
    NestjsPinoModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildPinoParams(config),
    }),
  ],
  providers: [AppLogger],
  exports: [NestjsPinoModule, AppLogger],
})
export class LoggerModule {}
