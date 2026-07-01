/**
 * TenantResolverMiddleware — runs ahead of `RequestContextMiddleware` on
 * every HTTP request. It calls `TenantResolverService.resolve()` to derive
 * a `ResolvedTenant` from the Host header (and the `X-Tenant-Slug` fallback
 * for non-DNS environments) and attaches the result onto the express `req`
 * object as `req.resolvedTenant`.
 *
 * The middleware never short-circuits. A tenant whose slug doesn't resolve
 * is parked in `scope: 'public'`; the downstream auth/RBAC layer decides
 * whether the absence of a tenant is fatal for the requested route. That
 * keeps W1.1 a pure infrastructure addition — no behaviour change to
 * existing routes.
 */
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TenantResolverService, type ResolvedTenant } from './tenant-resolver.service';

export type RequestWithResolvedTenant = Request & { resolvedTenant?: ResolvedTenant };

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  public constructor(private readonly tenantResolver: TenantResolverService) {}

  public async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const reqWithTenant = req as RequestWithResolvedTenant;
    try {
      const resolved = await this.tenantResolver.resolve(req.headers.host, req.headers);
      reqWithTenant.resolvedTenant = resolved;
    } catch (err) {
      // Resolution is advisory at W1.1 — never block the request. Tenant-aware
      // routes that follow will reject if the resolved tenant is missing.
      this.logger.warn(
        `Tenant resolution failed for host=${String(req.headers.host)}: ${(err as Error).message}`,
      );
      reqWithTenant.resolvedTenant = { scope: 'public', source: 'none', host: undefined };
    }
    next();
  }
}
