/**
 * TenantResolverService — resolves an HTTP request's tenant context from the
 * Host header (and an `X-Tenant-Slug` fallback for non-DNS environments).
 *
 * Wave W1.1 introduces this service as the *infrastructure* foundation for
 * the multi-tenant auth patch. It runs ahead of `RequestContextMiddleware`
 * and parks its result on the express `req` so downstream layers can read it.
 * Login and JWT-mint flows that consume the resolved tenant land in later
 * waves; this wave only establishes the resolution plumbing.
 *
 * Host patterns recognised (case-insensitive on the host, port stripped):
 *
 *   1. `admin.schoolos.in`     → platform scope, no `schoolId`.
 *   2. `<slug>.schoolos.in`    → tenant scope; look up `School` by `slug`.
 *   3. `app.schoolos.in`       → tenant scope; required `X-Tenant-Slug` header.
 *   4. `localhost` / `127.*`   → development. `X-Tenant-Slug` header optional;
 *                                if absent, the request is left in "public"
 *                                scope and tenant-aware routes will reject it.
 *
 * The service caches `slug → schoolId` lookups in-process with a short TTL
 * (60s by default). The cache is intentionally tiny: tenant slug is
 * stable, and a process restart is the simplest invalidation path.
 */
import { Inject, Injectable, forwardRef } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma';

export type TenantResolverSource = 'platform-host' | 'slug-host' | 'header' | 'none';

export interface ResolvedTenant {
  /** Final scope decision. `platform` corresponds to `admin.*`. */
  readonly scope: 'platform' | 'tenant' | 'public';
  /** The school the request belongs to, if any. */
  readonly schoolId?: string;
  /** Slug we resolved from (host or header). Useful in logs. */
  readonly slug?: string;
  /** How we arrived at the result. */
  readonly source: TenantResolverSource;
  /** Raw host (lower-cased, port stripped) used during resolution. */
  readonly host?: string;
}

interface SlugCacheEntry {
  readonly schoolId: string | null;
  readonly expiresAt: number;
}

const ROOT_DOMAIN = 'schoolos.in';
const PLATFORM_HOST = `admin.${ROOT_DOMAIN}`;
const APP_HOST = `app.${ROOT_DOMAIN}`;
const TENANT_SLUG_HEADER = 'x-tenant-slug';
const SLUG_CACHE_TTL_MS = 60_000;
const SLUG_CACHE_MAX_ENTRIES = 512;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

@Injectable()
export class TenantResolverService {
  private readonly slugCache = new Map<string, SlugCacheEntry>();

  public constructor(
    @Inject(forwardRef(() => PrismaService))
    private readonly prisma: PrismaService,
  ) {}

  public async resolve(rawHost: string | undefined, headers: Record<string, string | string[] | undefined>): Promise<ResolvedTenant> {
    const host = normaliseHost(rawHost);
    const headerSlug = sanitiseSlug(firstHeader(headers[TENANT_SLUG_HEADER]));

    if (host === PLATFORM_HOST) {
      return { scope: 'platform', source: 'platform-host', host };
    }

    if (host === APP_HOST) {
      if (headerSlug === undefined) {
        return { scope: 'public', source: 'none', host };
      }
      const schoolId = await this.lookupSlug(headerSlug);
      return schoolId === null
        ? { scope: 'public', source: 'header', host, slug: headerSlug }
        : { scope: 'tenant', source: 'header', host, slug: headerSlug, schoolId };
    }

    if (host !== undefined && host.endsWith(`.${ROOT_DOMAIN}`)) {
      const slugCandidate = sanitiseSlug(host.slice(0, host.length - ROOT_DOMAIN.length - 1));
      if (slugCandidate !== undefined) {
        const schoolId = await this.lookupSlug(slugCandidate);
        return schoolId === null
          ? { scope: 'public', source: 'slug-host', host, slug: slugCandidate }
          : { scope: 'tenant', source: 'slug-host', host, slug: slugCandidate, schoolId };
      }
    }

    if (host !== undefined && isLocalHost(host)) {
      if (headerSlug === undefined) {
        return { scope: 'public', source: 'none', host };
      }
      const schoolId = await this.lookupSlug(headerSlug);
      return schoolId === null
        ? { scope: 'public', source: 'header', host, slug: headerSlug }
        : { scope: 'tenant', source: 'header', host, slug: headerSlug, schoolId };
    }

    if (headerSlug !== undefined) {
      const schoolId = await this.lookupSlug(headerSlug);
      return schoolId === null
        ? { scope: 'public', source: 'header', host, slug: headerSlug }
        : { scope: 'tenant', source: 'header', host, slug: headerSlug, schoolId };
    }

    return { scope: 'public', source: 'none', host };
  }

  private async lookupSlug(slug: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.slugCache.get(slug);
    if (cached !== undefined && cached.expiresAt > now) {
      return cached.schoolId;
    }

    const row = await this.prisma.client.school.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    const schoolId = row?.id ?? null;

    if (this.slugCache.size >= SLUG_CACHE_MAX_ENTRIES) {
      const oldestKey = this.slugCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.slugCache.delete(oldestKey);
      }
    }
    this.slugCache.set(slug, { schoolId, expiresAt: now + SLUG_CACHE_TTL_MS });
    return schoolId;
  }

  /** Test seam — clears the in-process slug cache. */
  public clearCache(): void {
    this.slugCache.clear();
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function normaliseHost(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return undefined;
  const noPort = trimmed.split(':')[0] ?? trimmed;
  return noPort.length === 0 ? undefined : noPort;
}

function sanitiseSlug(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('127.') || host === '::1' || host === '0.0.0.0';
}
