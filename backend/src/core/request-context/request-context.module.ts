import { Global, Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../infra/prisma';
import { RequestContextInterceptor } from './request-context.interceptor';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextRegistry } from './request-context.service';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';
import { TenantResolverService } from './tenant-resolver.service';

/**
 * Registers the AsyncLocalStorage carrier as a Nest provider and exports
 * the middleware that binds it on every HTTP request.
 *
 * The actual state lives in module-static memory (see
 * `RequestContextRegistry`); the DI provider exists so consumers (e.g. the
 * future RBAC guard) can inject the registry where useful.
 *
 * W1.1 — also hosts `TenantResolverService` + `TenantResolverMiddleware`.
 * The resolver runs ahead of `RequestContextMiddleware` (see
 * `CoreModule.configure()`) so a resolved tenant is parked on `req` before
 * the AsyncLocalStorage context is bound. Auth layers in later waves will
 * lift `req.resolvedTenant.schoolId` into the bound context.
 *
 * W1.5 — also exports `RequestContextInterceptor`. CoreModule registers it
 * as APP_INTERCEPTOR ahead of AuditInterceptor so the controller phase
 * runs inside a frame re-bound from req.user + req.resolvedTenant after
 * guards have decided the principal.
 *
 * `PrismaModule` is imported with `forwardRef` because PrismaModule itself
 * imports RequestContextModule (its extension stack reads the ALS carrier).
 * The forward reference defers the resolution until both modules exist,
 * and `TenantResolverService` mirrors the forwardRef at the constructor
 * injection site.
 *
 * The middleware itself is registered in `CoreModule.configure()` so the
 * binding happens once at the top of the global pipeline.
 */
@Global()
@Module({
  imports: [forwardRef(() => PrismaModule)],
  providers: [
    { provide: RequestContextRegistry, useValue: RequestContextRegistry },
    RequestContextMiddleware,
    RequestContextInterceptor,
    TenantResolverService,
    TenantResolverMiddleware,
  ],
  exports: [
    RequestContextRegistry,
    RequestContextMiddleware,
    RequestContextInterceptor,
    TenantResolverService,
    TenantResolverMiddleware,
  ],
})
export class RequestContextModule {}
