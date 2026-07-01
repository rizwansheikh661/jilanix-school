/**
 * SchoolBrandingResolverService — single source of truth that maps a
 * `schoolId` into the variable bag every chrome surface (Email Design
 * System, Login pages, PDF reports, Invoices, Public Portal) reads from.
 *
 * Sprint N3 wires the resolver into the notification dispatcher; future
 * sprints will reuse the same `resolve(schoolId)` call from server-side
 * page renderers and PDF generators so business code never carries
 * branding values directly.
 *
 * Resolution order (later wins):
 *   1. `SCHOOLOS_DEFAULTS` — frozen brand defaults shipped with the platform.
 *   2. `School` row (display name, admin contact, website, postal address) —
 *      provides a sensible fallback for tenants that have not customised
 *      branding yet but already exist in the platform.
 *   3. `SchoolBranding` row — per-tenant overrides set by the school's admin
 *      via the (future) branding settings UI. Every column is nullable; a
 *      missing column transparently falls through to the lower layers.
 *
 * Caching: per-schoolId in-memory `Map`. Notifications and PDFs go through
 * the dispatcher / renderer many times per second during a fan-out, so the
 * `(SELECT * FROM school + SELECT * FROM school_branding)` round trip is
 * cached after the first hit. `invalidate(schoolId)` is called from
 * `SchoolBrandingService.update()` whenever an operator persists a change;
 * `invalidateAll()` is exposed for tests and admin tooling. There is no
 * TTL — branding rows change rarely and explicit invalidation is the
 * cheapest correctness guarantee.
 *
 * Never throws. The fallback chain guarantees a fully-populated branding
 * record even when (a) the school row is missing, (b) the branding row is
 * missing, or (c) both. Notifications must never fail because branding is
 * missing — that's a Sprint N3 hard invariant.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';

/**
 * Frozen SchoolOS-default branding. Mirrors `DEFAULT_EMAIL_BRANDING` in
 * `notification-renderer/email-design-system/branding.ts` so the same hex
 * literals and asset URLs appear regardless of which surface calls the
 * resolver.
 */
export const SCHOOLOS_DEFAULT_BRANDING = {
  schoolName: 'SchoolOS',
  schoolShortName: 'SchoolOS',
  schoolFullName: 'SchoolOS',
  schoolLogo:
    'https://jilanix-public.s3.ap-south-1.amazonaws.com/schoolos/email-default-logo.png',
  schoolDarkLogo:
    'https://jilanix-public.s3.ap-south-1.amazonaws.com/schoolos/email-default-logo.png',
  schoolFavicon: '',
  schoolLetterhead: '',
  loginBackground: '',
  emailBanner: '',
  pdfHeader: '',
  pdfFooter: '',
  primaryColor: '#2D4FCC',
  secondaryColor: '#1A2235',
  accentColor: '#0E9F8E',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  supportEmail: 'support@jilanix.com',
  supportPhone: '+91-00000-00000',
  websiteUrl: 'https://app.jilanix.com',
  applicationUrl: 'https://app.jilanix.com',
  schoolAddress: '',
  tagline: '',
  footerText: '',
  copyrightText: '© {{currentYear}} {{schoolName}}. All rights reserved.',
  previewText: '',
} as const;

export type ResolvedBranding = Readonly<Record<string, string>> & {
  readonly currentYear: string;
};

interface SchoolLookup {
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly stateCode: string | null;
  readonly pincode: string | null;
}

interface BrandingLookup {
  readonly shortName: string | null;
  readonly tagline: string | null;
  readonly logoUrl: string | null;
  readonly darkLogoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly letterheadUrl: string | null;
  readonly loginBackgroundUrl: string | null;
  readonly emailBannerUrl: string | null;
  readonly pdfHeaderUrl: string | null;
  readonly pdfFooterUrl: string | null;
  readonly brandPrimaryHex: string | null;
  readonly brandSecondaryHex: string | null;
  readonly brandAccentHex: string | null;
  readonly fontFamily: string | null;
  readonly supportEmail: string | null;
  readonly supportPhone: string | null;
  readonly websiteUrl: string | null;
  readonly footerText: string | null;
  readonly copyrightText: string | null;
}

@Injectable()
export class SchoolBrandingResolverService {
  private readonly logger = new Logger(SchoolBrandingResolverService.name);
  private readonly cache = new Map<string, ResolvedBranding>();

  constructor(private readonly prisma: PrismaService) {}

  public async resolve(schoolId: string): Promise<ResolvedBranding> {
    const cached = this.cache.get(schoolId);
    if (cached !== undefined) return cached;

    const resolved = await this.load(schoolId);
    this.cache.set(schoolId, resolved);
    return resolved;
  }

  /** Clear cache for a specific tenant (called when branding is updated). */
  public invalidate(schoolId: string): void {
    this.cache.delete(schoolId);
  }

  /** Drop every cached entry — primarily for tests and admin tooling. */
  public invalidateAll(): void {
    this.cache.clear();
  }

  private async load(schoolId: string): Promise<ResolvedBranding> {
    const [school, branding] = await Promise.all([
      this.loadSchool(schoolId),
      this.loadBranding(schoolId),
    ]);

    return this.compose(school, branding);
  }

  private async loadSchool(schoolId: string): Promise<SchoolLookup | null> {
    try {
      const row = await this.prisma.client.school.findFirst({
        where: { id: schoolId, deletedAt: null },
        select: {
          displayName: true,
          email: true,
          phone: true,
          website: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          stateCode: true,
          pincode: true,
        },
      });
      return row as SchoolLookup | null;
    } catch (err) {
      this.logger.warn(
        `SchoolBrandingResolver: school lookup failed schoolId=${schoolId} err=${(err as Error).message}`,
      );
      return null;
    }
  }

  private async loadBranding(schoolId: string): Promise<BrandingLookup | null> {
    try {
      const row = await this.prisma.client.schoolBranding.findFirst({
        where: { schoolId },
        select: {
          shortName: true,
          tagline: true,
          logoUrl: true,
          darkLogoUrl: true,
          faviconUrl: true,
          letterheadUrl: true,
          loginBackgroundUrl: true,
          emailBannerUrl: true,
          pdfHeaderUrl: true,
          pdfFooterUrl: true,
          brandPrimaryHex: true,
          brandSecondaryHex: true,
          brandAccentHex: true,
          fontFamily: true,
          supportEmail: true,
          supportPhone: true,
          websiteUrl: true,
          footerText: true,
          copyrightText: true,
        },
      });
      return row as BrandingLookup | null;
    } catch (err) {
      this.logger.warn(
        `SchoolBrandingResolver: branding lookup failed schoolId=${schoolId} err=${(err as Error).message}`,
      );
      return null;
    }
  }

  private compose(
    school: SchoolLookup | null,
    branding: BrandingLookup | null,
  ): ResolvedBranding {
    const fullName =
      pick(branding?.shortName, school?.displayName, SCHOOLOS_DEFAULT_BRANDING.schoolFullName);
    const shortName =
      pick(branding?.shortName, school?.displayName, SCHOOLOS_DEFAULT_BRANDING.schoolShortName);
    const websiteUrl =
      pick(branding?.websiteUrl, school?.website, SCHOOLOS_DEFAULT_BRANDING.websiteUrl);
    const logoUrl = pick(branding?.logoUrl, SCHOOLOS_DEFAULT_BRANDING.schoolLogo);

    return {
      // Identity
      schoolName: shortName,
      schoolShortName: shortName,
      schoolFullName: fullName,
      tagline: pick(branding?.tagline, SCHOOLOS_DEFAULT_BRANDING.tagline),

      // Visual assets
      schoolLogo: logoUrl,
      schoolDarkLogo: pick(branding?.darkLogoUrl, logoUrl),
      schoolFavicon: pick(branding?.faviconUrl, SCHOOLOS_DEFAULT_BRANDING.schoolFavicon),
      schoolLetterhead: pick(branding?.letterheadUrl, SCHOOLOS_DEFAULT_BRANDING.schoolLetterhead),
      loginBackground: pick(branding?.loginBackgroundUrl, SCHOOLOS_DEFAULT_BRANDING.loginBackground),
      emailBanner: pick(branding?.emailBannerUrl, SCHOOLOS_DEFAULT_BRANDING.emailBanner),
      pdfHeader: pick(branding?.pdfHeaderUrl, branding?.letterheadUrl, SCHOOLOS_DEFAULT_BRANDING.pdfHeader),
      pdfFooter: pick(branding?.pdfFooterUrl, SCHOOLOS_DEFAULT_BRANDING.pdfFooter),

      // Palette
      primaryColor: pick(branding?.brandPrimaryHex, SCHOOLOS_DEFAULT_BRANDING.primaryColor),
      secondaryColor: pick(branding?.brandSecondaryHex, SCHOOLOS_DEFAULT_BRANDING.secondaryColor),
      accentColor: pick(branding?.brandAccentHex, SCHOOLOS_DEFAULT_BRANDING.accentColor),

      // Typography
      fontFamily: pick(branding?.fontFamily, SCHOOLOS_DEFAULT_BRANDING.fontFamily),

      // Contact
      supportEmail: pick(branding?.supportEmail, school?.email, SCHOOLOS_DEFAULT_BRANDING.supportEmail),
      supportPhone: pick(branding?.supportPhone, school?.phone, SCHOOLOS_DEFAULT_BRANDING.supportPhone),
      websiteUrl,
      applicationUrl: websiteUrl,
      schoolAddress: composeAddress(school),

      // Chrome copy
      footerText: pick(branding?.footerText, SCHOOLOS_DEFAULT_BRANDING.footerText),
      copyrightText: pick(branding?.copyrightText, SCHOOLOS_DEFAULT_BRANDING.copyrightText),

      // Dynamic
      currentYear: String(new Date().getFullYear()),
      previewText: SCHOOLOS_DEFAULT_BRANDING.previewText,
    };
  }
}

/**
 * Return the first defined, non-null, non-empty argument. Empty strings are
 * treated as "not set" so a row with `support_email = ''` still falls through
 * to the next layer rather than emitting an empty `mailto:` link.
 */
function pick(...candidates: ReadonlyArray<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      return candidate;
    }
  }
  return '';
}

function composeAddress(school: SchoolLookup | null): string {
  if (school === null) return '';
  const parts = [
    school.addressLine1,
    school.addressLine2,
    school.city,
    school.stateCode,
    school.pincode,
  ].filter((part): part is string => part !== null && part !== '');
  return parts.join(', ');
}
