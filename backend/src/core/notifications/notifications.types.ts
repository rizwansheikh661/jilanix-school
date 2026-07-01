/**
 * Notifications domain row shapes + shared inputs/outputs.
 *
 * Where possible we lean on `Prisma.<Model>GetPayload<{}>` so the type
 * automatically reflects schema changes. Decimal columns surface as
 * `number` after `toNumber()` conversion at the repo boundary (no
 * Decimal columns in Sprint 10 — all amounts are Int counters).
 *
 * The shared `PrismaTx` handle is re-exported from `infra/prisma/types`
 * so callers don\u2019t need to dig two layers deep.
 */
import type { Prisma } from '@prisma/client';

export type {
  NotificationChannelValue,
  NotificationCategoryValue,
  NotificationPriorityValue,
  NotificationMessageStatusValue,
  NotificationCampaignStatusValue,
  NotificationCampaignTargetValue,
  NotificationAudienceValue,
} from './notifications.constants';

export type { PrismaTx } from '../../infra/prisma/types';

// ---------------------------------------------------------------------------
// Row aliases — direct projections of the persisted models.
// ---------------------------------------------------------------------------
export type NotificationTemplateRow = Prisma.NotificationTemplateGetPayload<{}>;
export type NotificationTemplateVersionRow =
  Prisma.NotificationTemplateVersionGetPayload<{}>;
export type NotificationMessageRow = Prisma.NotificationMessageGetPayload<{}>;
export type NotificationMessageEventRow =
  Prisma.NotificationMessageEventGetPayload<{}>;
export type NotificationUserPreferenceRow =
  Prisma.NotificationUserPreferenceGetPayload<{}>;
export type NotificationCampaignRow = Prisma.NotificationCampaignGetPayload<{}>;
export type NotificationCampaignRecipientRow =
  Prisma.NotificationCampaignRecipientGetPayload<{}>;
export type SchoolCommunicationEntitlementRow =
  Prisma.SchoolCommunicationEntitlementGetPayload<{}>;

/** Message + its APPEND_ONLY event ledger, eagerly loaded for detail views. */
export type NotificationMessageWithEvents = NotificationMessageRow & {
  readonly events: readonly NotificationMessageEventRow[];
};

// ---------------------------------------------------------------------------
// Renderer types live in `./notification-renderer`. The legacy
// `RenderedTemplate` shape that used to live here (with templateVersionNo)
// was unused; the dispatcher records the version number directly on the
// `NotificationMessage` row instead of folding it into the renderer output.
// ---------------------------------------------------------------------------

/** Inputs the renderer needs to perform `{{var}}` substitution. */
export interface RenderContext {
  readonly variables: Record<string, unknown>;
  readonly locale: string;
}

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------
export interface EntitlementSnapshot {
  readonly schoolId: string;
  readonly channels: {
    readonly email: boolean;
    readonly sms: boolean;
    readonly whatsapp: boolean;
    readonly inApp: boolean;
  };
  readonly limits: {
    readonly email: number | null;
    readonly sms: number | null;
    readonly whatsapp: number | null;
  };
  readonly used: {
    readonly email: number;
    readonly sms: number;
    readonly whatsapp: number;
  };
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly isTrial: boolean;
  readonly trialExpiresAt?: Date;
}

// ---------------------------------------------------------------------------
// Event dispatch — see notification-event-dispatcher.service for the
// runtime input/output shapes used by Wave 7+ callers.
// ---------------------------------------------------------------------------
