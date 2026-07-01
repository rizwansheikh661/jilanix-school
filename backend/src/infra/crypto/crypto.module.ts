import { Global, Module } from '@nestjs/common';

import { CryptoService } from './crypto.service';

/**
 * CryptoModule — provides the application-wide PII column cipher.
 *
 * `@Global()` so feature modules can inject `CryptoService` without
 * importing the module. There is only one logical cipher per process today
 * (single global key); per-tenant CMK lands in Sprint 18 but the consumer
 * signatures stay the same.
 *
 * ConfigModule is itself `@Global`, so we do not need to import it.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
