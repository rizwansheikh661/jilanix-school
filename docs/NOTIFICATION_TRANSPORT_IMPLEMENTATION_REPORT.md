# Notification Transport Implementation Report — Sprint N1

**Date:** 2026-06-29
**Scope:** Wire the existing Notifications module (Sprint 10) to a real SMTP transport via Nodemailer + Mailpit. Functional Forgot-Password email only. No framework redesign.

---

## 1. Files Modified

### Backend code

| Path | Change |
|------|--------|
| `backend/package.json` | Added `nodemailer` runtime dep + `@types/nodemailer` dev dep. |
| `backend/src/core/config/env.schema.ts` | Added `MAIL_TRANSPORT` (`smtp`/`json`), `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Prod profile rejects `MAIL_TRANSPORT=json`. |
| `backend/src/core/config/config.service.ts` | Exposed `cfg.mail.{transport,from,smtp}`. |
| `backend/src/core/notifications/channels/email-transport.service.ts` | **NEW.** Provider-agnostic Nodemailer wrapper. Builds a pooled SMTP transporter on bootstrap, exposes `send({to, subject, text, html, headers})`. `SMTPPool.Options` typing (not `SMTPTransport.Options`) because `pool: true` requires the pool variant. |
| `backend/src/core/notifications/channels/adapters/ses.adapter.ts` | Replaced the stub `throw NotImplementedError` with a real call into `EmailTransportService.send()`. Adapter still self-registers under `EMAIL:ses` so no registry changes are needed. |
| `backend/src/core/notifications/notification-dispatcher/notification-send-queue.bootstrap.ts` | **NEW.** Idempotently upserts a no-cron `JobDefinition` for the `"notifications"` queue so `JobProcessorService.discoverQueues()` polls it. Without this, the send job sits at `status=queued` forever (Sprint 10 gap surfaced by N1). |
| `backend/src/core/notifications/notifications.module.ts` | Registered `EmailTransportService` + `NotificationSendQueueBootstrap` as providers. Exported `NotificationTemplateRepository` so the password-reset handler can ensure-create templates. |
| `backend/src/core/provisioning/password-reset/password-reset-notification.outbox-handler.ts` | **NEW.** Subscribes to `provisioning.password_reset.requested`, lazily upserts a plain-text email template per `(schoolId, PASSWORD_RESET_REQUESTED)`, then calls `NotificationEventDispatcherService.dispatch()`. Wraps the call in `runWithSystemContext({schoolId, actorScope: 'tenant'})` because the outbox dispatcher runs without a parent ALS context. |
| `backend/src/core/provisioning/provisioning.module.ts` | Added the handler to providers; imported `NotificationsModule`. |
| `backend/.env` | Added `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`. Also set `OUTBOX_DISPATCHER_ENABLED=true` and `JOBS_PROCESSOR_ENABLED=true` (off by default in dev). |

### Infra

| Path | Change |
|------|--------|
| `docker-compose.yml` | Added `mailpit` service (axllent/mailpit:latest, ports `1025:1025` SMTP, `8025:8025` UI, healthcheck on HTTP 8025). |

### Docs

| Path | Change |
|------|--------|
| `docs/NOTIFICATION_TRANSPORT_IMPLEMENTATION_REPORT.md` | This file. |

---

## 2. Transport Architecture

```
PasswordResetService.request()
   └── publishes outbox topic `provisioning.password_reset.requested`
        └── OutboxDispatcherService picks up the row, invokes registered handler
             └── PasswordResetNotificationOutboxHandler
                  ├── runWithSystemContext({schoolId, actorScope: 'tenant'})
                  ├── ensures NotificationTemplate row exists (lazy upsert)
                  └── NotificationEventDispatcherService.dispatch(...)
                       ├── resolves recipients + preferences + entitlements
                       ├── renders subject/body via {{var}} regex renderer
                       ├── persists NotificationMessage (status=QUEUED)
                       └── publishes outbox topic `notification.queued`
                            └── NotificationQueuedOutboxHandler
                                 └── enqueues Job (queue="notifications", type="notification.send")
                                      └── JobProcessorService.tick() claims it
                                           └── NotificationSendJobHandler
                                                ├── channel registry.resolve(EMAIL:ses)
                                                ├── SesAdapter.send() (now real)
                                                │    └── EmailTransportService.send()
                                                │         └── Nodemailer SMTP → Mailpit:1025
                                                └── updates NotificationMessage.status=SENT
```

**Decision: provider-agnostic transport.** `EmailTransportService` only speaks SMTP. The provider choice (Mailpit / SES / SendGrid / Mailgun / etc.) is a deployment-time config knob, not a code switch. Sprint N1's "SES adapter" is a misnomer carried over from Sprint 10's stub naming — at the wire level it is now a plain SMTP send that works against any SMTP server.

**Why a `NotificationSendQueueBootstrap`?** Sprint 10's `JobProcessorService.discoverQueues()` only polls queues with an active `JobDefinition` row (+ `"default"`). The dispatcher enqueues on `"notifications"` ad-hoc, so without a JobDefinition the jobs were silently queued. The bootstrap upserts a `scheduleCron: null` row purely as a queue marker — `JobSchedulerService.listActiveScheduled()` skips it (no cron), but `JobProcessorService` discovers the queue and polls it.

---

## 3. Mailpit Setup

Docker Compose snippet:

```yaml
mailpit:
  image: axllent/mailpit:latest
  container_name: schoolos-mailpit
  restart: unless-stopped
  ports:
    - "1025:1025"   # SMTP listener
    - "8025:8025"   # Web UI / REST API
  environment:
    MP_SMTP_AUTH_ACCEPT_ANY: "true"
    MP_SMTP_AUTH_ALLOW_INSECURE: "true"
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8025/"]
    interval: 10s
    timeout: 3s
    retries: 5
```

**Access:**
- SMTP: `localhost:1025` (no TLS, no auth in dev).
- UI: <http://localhost:8025>
- REST API: `GET http://localhost:8025/api/v1/messages` and `GET .../message/{id}`.

---

## 4. SMTP Configuration

**Validated env vars (`backend/src/core/config/env.schema.ts`):**

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| `MAIL_TRANSPORT` | `'smtp' \| 'json'` | `smtp` | Prod profile rejects `json`. |
| `MAIL_FROM` | string | `SchoolOS <no-reply@schoolos.local>` | RFC 5322 mailbox. |
| `SMTP_HOST` | string | `localhost` | |
| `SMTP_PORT` | int | `1025` | |
| `SMTP_SECURE` | bool | `false` | `true` for port 465. |
| `SMTP_USER` | string \| undefined | undefined | Set with `SMTP_PASSWORD` for AUTH. |
| `SMTP_PASSWORD` | string \| undefined | undefined | Redacted in startup logs. |

`config.mail.from` is logged in cleartext; `SMTP_PASSWORD` is logged as `<unset>` / `***`.

---

## 5. Email Adapter Implementation

`SesAdapter` (kept the historical name to avoid registry-key churn) now resolves to a real SMTP send:

```ts
public async send(input: SendInput): Promise<SendResult> {
  const result = await this.transport.send({
    to: input.address,
    subject: input.subject ?? '',
    text: input.body,
    html: null,
    headers: input.headers,
  });
  return { providerMessageId: result.messageId, providerStatus: 'accepted' };
}
```

`EmailTransportService` owns the Nodemailer transporter:

```ts
const options: SMTPPool.Options = {
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  pool: true,
};
if (smtp.user && smtp.password) options.auth = { user: smtp.user, pass: smtp.password };
return nodemailer.createTransport(options);
```

Pool is shared across all sends; `onApplicationShutdown()` closes it.

---

## 6. Forgot-Password Runtime Verification

**Setup:**
```
docker compose up -d mailpit
cd backend && npm run start:dev   # Nest boots on :3000 with mail.transport=smtp, host=localhost:1025
```

**Trigger:**
```
curl -s -X POST http://localhost:3000/api/v1/auth/password-reset/request \
  -H 'Content-Type: application/json' \
  -d '{"schoolId":"36c2e579-83f9-42c8-958a-ab00e58e5b1e","email":"school.admin@canary.local"}'
→ {"data":{"accepted":true},"meta":{"requestId":"01KW9V0BYSDFWST5WZ56DPE2WS"}}  HTTP 200
```

**Pipeline trace (DB):**

| Stage | Table | Row | Status |
|------|-------|-----|--------|
| Outbox publish (provisioning) | `outbox` | `01KW9TYEV6KAZATP92RTCRMVMX` topic=`provisioning.password_reset.requested` | `delivered` |
| Dispatcher → message | `notification_messages` | `9196bbf6-6b7c-4e6e-9187-5a86f52604bc` channel=EMAIL | `SENT` at `2026-06-29 14:02:26.701` |
| Outbox publish (notifications) | `outbox` | topic=`notification.queued` | `delivered` |
| Job claim/run | `jobs` | type=`notification.send` queue=`notifications` | `completed` |

**Mailpit inbox (`GET /api/v1/messages` returned `total: 1`):**

```
From:    no-reply@schoolos.local
Subject: Reset your SchoolOS password
Text:
  Hello,

  A password reset was requested for school.admin@canary.local.

  Open the link below to choose a new password. The link expires at 2026-06-29T15:02:21.539Z.

  http://localhost:3000/reset-password?token=OSOJhusnvBibO0FsvamHDCBTZ5c-EZICh1Cwlfzhahw

  If you did not request this, you can safely ignore this email.

  — SchoolOS
```

`{{userEmail}}`, `{{expiresAt}}`, `{{resetLink}}` rendered correctly via the existing regex template renderer.

---

## 7. Remaining Notification Work

Not in N1 scope; documented as follow-ups:

- **HTML email body.** Current template is plain text only. Once we have an HTML renderer (MJML / Handlebars), revise the lazy template to ship `bodyHtml`.
- **Provider switching by tenant.** Today `cfg.mail.*` is process-wide. A multi-tenant prod will need per-tenant provider config (probably via `CommunicationProvider` rows + a provider-resolution step in `EmailTransportService.send`).
- **Welcome / Fee Reminder / Attendance / Exam-result / Holiday-announce templates.** Out of N1 scope; will repeat the lazy-ensure pattern (or move to a proper seeder once the catalog stabilises).
- **Retry / DLQ tuning.** Current backoff is the Sprint 5 default `30s, 2m, 10m, 1h, 4h`. Email-specific retry policy (e.g. shorter for transient SMTP 4xx, immediate DLQ on 5xx bounce) not implemented.
- **Feature-flag `defaultValue` upsert.** `FeatureFlagDefinitionRepository.upsertByKey` only updates name/description/kind/owner, *not* `defaultValue`. Sprint N1 surfaced this when `comms.provider.ses` stayed at `0` despite the bootstrap declaring `true`. Worked around with a manual `UPDATE`; framework fix is out of scope.
- **Schema drift handling.** Two columns (`notification_user_preferences.channel_push`, `.emergency_override`) had been added to `schema.prisma` (Sprint 17) but never `db push`-ed to local. Patched manually mid-sprint with `ALTER TABLE … ADD COLUMN`. A dev-environment migration audit would catch this earlier.
- **Inbound bounce / complaint handling.** No webhook receivers; bounces silently land back in the SMTP MTA.

---

## 8. Final Readiness

| Sub-task | Status |
|----------|--------|
| N1 — Nodemailer-based EmailTransportService | ✅ |
| N2 — Validated MAIL_/SMTP_ env vars (env.schema.ts + ConfigService) | ✅ |
| N3 — Mailpit in docker-compose (SMTP 1025, UI 8025) | ✅ |
| N4 — Real EMAIL adapter using the new transport | ✅ |
| N5 — `provisioning.password_reset.requested` → dispatcher | ✅ |
| N6 — Live verification: forgot-password POST → Mailpit inbox | ✅ |

**End-to-end pipeline confirmed:** controller → service → outbox row (`delivered`) → handler → dispatcher → `NotificationMessage` (status `SENT`) → outbox `notification.queued` (`delivered`) → `notification.send` job (`completed`) → SMTP → Mailpit (`total: 1`).

**Out-of-scope items not touched:** outbox framework, job-queue framework, dispatcher behaviour, DB schema beyond the two ALTER TABLEs that were already pending from Sprint 17, in-app channel, broadcast campaigns, MFA, password-reset confirm flow.
