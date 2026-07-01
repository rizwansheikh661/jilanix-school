import { Global, Module } from '@nestjs/common';

import { LoggerModule } from '../logger';
import { RequestContextModule } from '../request-context';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { FinanceChainService } from './finance-chain/chain.service';
import { AuditRepository } from './repositories/audit.repository';
import { AuditServiceBridge } from './audit.bridge';

/**
 * AuditModule — wires the audit foundation.
 *
 * Exports:
 *   - AuditService          — programmatic API (`record`, `flushBufferedIntents`)
 *   - AuditInterceptor      — `@Audit(...)` driver
 *   - FinanceChainService   — exposed for verify tooling
 *
 * Imports `PrismaModule` indirectly via `AuditRepository`. PrismaModule is
 * already `@Global()` so no explicit import is needed.
 *
 * The `AuditServiceBridge` is bound at module init and gives the Prisma
 * `auditExt` extension a back-channel to the service without creating a
 * circular module dependency (PrismaModule cannot import AuditModule —
 * audit depends on prisma).
 */
@Global()
@Module({
  imports: [LoggerModule, RequestContextModule],
  providers: [
    AuditRepository,
    FinanceChainService,
    AuditService,
    AuditInterceptor,
    AuditServiceBridge,
  ],
  exports: [AuditService, AuditInterceptor, FinanceChainService],
})
export class AuditModule {}
