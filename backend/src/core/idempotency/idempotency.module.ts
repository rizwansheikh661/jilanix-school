import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { IdempotencyMiddleware } from './idempotency.middleware';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyKeyRepository } from './repositories/idempotency-key.repository';

@Module({
  providers: [IdempotencyKeyRepository, IdempotencyService, IdempotencyMiddleware],
  exports: [IdempotencyService],
})
export class IdempotencyModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
