import { Global, Module, forwardRef } from '@nestjs/common';

import { ConfigModule } from '../../core/config';
import { RequestContextModule } from '../../core/request-context';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule is global — there is only ever one PrismaService and every
 * feature module reaches for it. Avoids `imports: [PrismaModule]` boilerplate
 * in every feature module.
 *
 * RequestContextModule is imported here because the extension stack reads
 * the AsyncLocalStorage carrier registered by that module. Importing it
 * here (instead of relying on consumers to import it) keeps PrismaModule's
 * promise — "wire me up and tenant scoping just works" — honest.
 *
 * The reference is wrapped in `forwardRef` because W1.1 added a reciprocal
 * import (RequestContextModule's `TenantResolverService` injects
 * PrismaService). The forwardRef lets Nest break the construction cycle.
 */
@Global()
@Module({
  imports: [ConfigModule, forwardRef(() => RequestContextModule)],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
