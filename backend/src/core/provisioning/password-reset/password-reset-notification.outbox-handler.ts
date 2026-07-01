/**
 * PasswordResetNotificationOutboxHandler — Sprint N1 wiring.
 *
 * Subscribes to `provisioning.password_reset.requested` and bridges into the
 * NotificationEventDispatcher so the existing notification framework
 * (outbox → job queue → channel adapter → SMTP transport) carries the reset
 * link to the user's mailbox.
 *
 * Lazy template ensure: per the BACKEND_FREEZE_V1 invariant, dispatching an
 * event requires a NotificationTemplate row for (schoolId, eventKey). Sprint
 * N1 cannot rely on operators having authored one, so this handler upserts a
 * minimal plain-text template the first time it sees a tenant. Operators may
 * later replace the body via the regular template CRUD API; the handler will
 * not overwrite an existing row.
 *
 * Idempotency: the dispatcher's `dedupeKey` collapses retries on the same
 * (eventKey, userId) into a single NotificationMessage; the outbox dispatcher
 * already retries this handler safely.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../../infra/prisma';
import { NotificationEventDispatcherService } from '../../notifications/notification-event-dispatcher/notification-event-dispatcher.service';
import {
  emailAlertBox,
  emailPrimaryButton,
  emailSecondaryText,
} from '../../notifications/notification-renderer/email-design-system';
import { NotificationTemplateRepository } from '../../notifications/notification-template/notification-template.repository';
import type { OutboxEventRow } from '../../outbox/outbox.types';
import { OutboxHandlerRegistry } from '../../outbox/services/outbox-handler.registry';
import { runWithSystemContext } from '../../request-context';
import { ProvisioningNotificationEventKeys, ProvisioningOutboxTopics } from '../provisioning.constants';

const TEMPLATE_CODE = 'sys.password_reset_requested.email';
const TEMPLATE_NAME = 'Password reset requested (email)';
const TEMPLATE_SUBJECT = 'Reset your {{schoolName}} password';
const TEMPLATE_BODY = [
  'Hello {{userName}},',
  '',
  'We received a request to reset the password for your {{schoolName}} account.',
  'Click the link below to choose a new one. If you did not make this request,',
  "you can safely ignore this email — your password won't change.",
  '',
  '{{resetLink}}',
  '',
  'This link expires after {{expiresAt}}.',
  '',
  '— {{schoolName}}',
].join('\n');

/**
 * Per-template HTML **fragment** — just the content slot. The shared
 * `BASE_EMAIL_LAYOUT` is composed around it at render time by
 * `renderTemplateForChannel`, so we do NOT repeat header/footer/chrome
 * markup here.
 */
const TEMPLATE_BODY_HTML = [
  `<p style="margin:0 0 16px 0;color:#1A2235;font-size:15px;line-height:1.6;font-weight:600;">Hello {{userName}},</p>`,
  emailSecondaryText(
    "We received a request to reset the password for your <strong>{{schoolName}}</strong> account. Click the button below to choose a new one. If you didn't make this request, you can safely ignore this email — your password won't change.",
  ),
  emailPrimaryButton({ href: '{{resetLink}}', label: 'Reset Password' }),
  emailAlertBox({
    tone: 'info',
    title: 'Security notice',
    bodyHtml:
      "If you didn't request a password reset, no action is needed — but please let your school administrator know so they can review recent account activity.",
  }),
  emailAlertBox({
    tone: 'warning',
    title: 'This link expires soon',
    bodyHtml:
      'For your security, this password reset link will stop working after:<br><strong style="color:#B45309;">{{expiresAt}}</strong><br>Request a new one if it expires before you use it.',
  }),
].join('\n');

interface PasswordResetRequestedPayload {
  readonly userId: string;
  readonly schoolId: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: string;
}

@Injectable()
export class PasswordResetNotificationOutboxHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PasswordResetNotificationOutboxHandler.name);

  constructor(
    private readonly outboxRegistry: OutboxHandlerRegistry,
    private readonly dispatcher: NotificationEventDispatcherService,
    private readonly templates: NotificationTemplateRepository,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  public onApplicationBootstrap(): void {
    this.outboxRegistry.registerTopic(
      ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED,
      (event) => this.handle(event),
    );
    this.logger.log(
      `Subscribed to "${ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED}" for notification dispatch.`,
    );
  }

  private async handle(event: OutboxEventRow): Promise<void> {
    const payload = event.payload as PasswordResetRequestedPayload | null;
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.userId !== 'string' ||
      typeof payload.schoolId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.token !== 'string' ||
      typeof payload.expiresAt !== 'string'
    ) {
      throw new Error(
        `${ProvisioningOutboxTopics.PASSWORD_RESET_REQUESTED} payload malformed: ${JSON.stringify(event.payload)}`,
      );
    }

    await runWithSystemContext(
      { schoolId: payload.schoolId, actorScope: 'tenant' },
      () => this.dispatchInTenantContext(payload),
    );
  }

  private async dispatchInTenantContext(payload: PasswordResetRequestedPayload): Promise<void> {
    await this.ensureTemplate(payload.schoolId);

    const resetLink = `${this.config.app.baseUrl}/reset-password?token=${encodeURIComponent(payload.token)}`;
    const userName = await this.resolveUserName(payload.schoolId, payload.userId, payload.email);
    const expiresAtFormatted = this.formatExpiry(payload.expiresAt);

    await this.dispatcher.dispatch({
      eventKey: ProvisioningNotificationEventKeys.PASSWORD_RESET_REQUESTED,
      schoolId: payload.schoolId,
      recipients: [
        {
          userId: payload.userId,
          address: payload.email,
          audience: 'USER',
        },
      ],
      variables: {
        userEmail: payload.email,
        userName,
        resetLink,
        resetUrl: resetLink,
        expiresAt: expiresAtFormatted,
        emailTitle: 'Reset your password',
        previewText: 'Click the link inside to choose a new password.',
      },
      aggregateType: 'User',
      aggregateId: payload.userId,
      // Each user-initiated password reset gets a fresh token; without a
      // token-scoped dedupe key every subsequent reset for the same user
      // would collide with the historical row on
      // (eventKey, aggregateId, recipientUserId, channel) and be silently
      // suppressed. The token already guarantees per-request uniqueness
      // AND collapses outbox retries of the same reset request.
      dedupeKey: `PASSWORD_RESET_REQUESTED:${payload.token}`,
      // Account-recovery email must bypass quiet hours and per-user channel
      // opt-outs. A user locked out at 02:00 cannot wait until 07:00 IST.
      priorityOverride: 'CRITICAL',
    });
  }

  private async resolveUserName(
    schoolId: string,
    userId: string,
    fallbackEmail: string,
  ): Promise<string> {
    const row = await this.prisma.client.user.findFirst({
      where: { schoolId, id: userId },
      select: { displayName: true },
    });
    const name = row?.displayName?.trim();
    if (name !== undefined && name.length > 0) return name;
    // Last-resort fallback: derive a friendly form from the email local-part
    // so the greeting never reads "Hello ,".
    const local = fallbackEmail.split('@')[0] ?? fallbackEmail;
    return local
      .split(/[._-]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ') || fallbackEmail;
  }

  /**
   * Render an ISO instant as "30 June, 2026 11:54 am (India Time)" without
   * pulling in a date library — Intl is already available in Node 20.
   */
  private formatExpiry(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    const dayPeriod = get('dayPeriod').toLowerCase().replace(/\s+/g, '');
    return `${day} ${month}, ${year} ${hour}:${minute} ${dayPeriod} (India Time)`;
  }

  private async ensureTemplate(schoolId: string): Promise<void> {
    const existing = await this.templates.list(undefined, schoolId, {
      eventKey: ProvisioningNotificationEventKeys.PASSWORD_RESET_REQUESTED,
      channel: 'EMAIL',
      isActive: true,
      limit: 1,
    });
    if (existing.rows.length > 0) {
      await this.refreshTemplateIfDrifted(schoolId, existing.rows[0]!);
      return;
    }

    const header = await this.templates.create(undefined, schoolId, {
      code: TEMPLATE_CODE,
      name: TEMPLATE_NAME,
      description:
        'Auto-provisioned password reset email — SchoolOS Email Design System (Sprint N2).',
      channel: 'EMAIL',
      category: 'SYSTEM',
      eventKey: ProvisioningNotificationEventKeys.PASSWORD_RESET_REQUESTED,
      defaultPriority: 'CRITICAL',
      audience: 'USER',
      variablesSpec: { userEmail: 'string', resetLink: 'string', expiresAt: 'string' },
      createdBy: null,
    });
    await this.templates.appendVersion(undefined, schoolId, {
      notificationTemplateId: header.id,
      versionNo: 1,
      subject: TEMPLATE_SUBJECT,
      bodyText: TEMPLATE_BODY,
      bodyHtml: TEMPLATE_BODY_HTML,
      variablesSnapshot: { userEmail: 'string', resetLink: 'string', expiresAt: 'string' },
      createdBy: null,
    });
    this.logger.log(
      `Auto-provisioned PASSWORD_RESET_REQUESTED email template for schoolId=${schoolId} (with HTML body).`,
    );
  }

  /**
   * If the active version's body diverges from the constants above (e.g.
   * after a code change like Sprint N2's design-system refresh), append a
   * new version and point the header at it. Without this, already-
   * provisioned tenants would keep sending the previous design forever.
   */
  private async refreshTemplateIfDrifted(
    schoolId: string,
    header: { readonly id: string; readonly activeVersionNo: number; readonly version: number },
  ): Promise<void> {
    const active = await this.templates.findActiveVersion(undefined, schoolId, header.id);
    if (
      active !== null &&
      active.bodyHtml === TEMPLATE_BODY_HTML &&
      active.bodyText === TEMPLATE_BODY &&
      active.subject === TEMPLATE_SUBJECT
    ) {
      return;
    }
    const nextVersionNo = header.activeVersionNo + 1;
    await this.templates.appendVersion(undefined, schoolId, {
      notificationTemplateId: header.id,
      versionNo: nextVersionNo,
      subject: TEMPLATE_SUBJECT,
      bodyText: TEMPLATE_BODY,
      bodyHtml: TEMPLATE_BODY_HTML,
      variablesSnapshot: { userEmail: 'string', resetLink: 'string', expiresAt: 'string' },
      createdBy: null,
    });
    await this.templates.update(undefined, schoolId, header.id, header.version, {
      activeVersionNo: nextVersionNo,
      updatedBy: null,
    });
    this.logger.log(
      `Refreshed PASSWORD_RESET_REQUESTED template for schoolId=${schoolId} → v${nextVersionNo}.`,
    );
  }
}
