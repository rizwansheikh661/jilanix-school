# Notification & Email Foundation Audit

**Date:** 2026-06-29
**Scope:** READ-ONLY discovery of the notification + email infrastructure that
already exists in this repository. No code, schema, env, or compose file was
modified during this audit.

---

## 1. Existing Modules

The backend ships a **substantial** notification skeleton already organised
under `backend/src/core/notifications/`. The following submodules exist:

| Submodule | Path | Purpose |
|---|---|---|
| Channel registry + adapters | `notifications/channels/` | Pluggable channel registry (`communication-channel.registry.ts`) with one adapter file per channel. |
| Event registry | `notifications/notification-event.registry.ts` + `notification-events.catalog.ts` | Static catalog of notification event keys (e.g. `auth.password_reset.requested`). |
| Event dispatcher | `notifications/notification-event-dispatcher/notification-event-dispatcher.service.ts:103` (`NotificationEventDispatcherService`) | Public entry point — domains call `eventDispatcher.dispatch({ eventKey, recipients, vars, schoolId })`. |
| Outbox/job bridge | `notifications/notification-dispatcher/notification-queued.outbox-handler.ts` + `notification-send.job-handler.ts` | Consumes `notification.queued` from `Outbox` and enqueues a `Job` row whose handler invokes the channel adapter. |
| Template engine | `notifications/notification-renderer/notification-template-renderer.ts` | In-house `{{token}}` substitution; HTML-escaped for `bodyHtml`, plain for subject/text. |
| Template CRUD | `notifications/notification-template/` | DB-backed template + version model (Prisma). |
| Message log | `notifications/notification-message/` | Per-message delivery row + event log. |
| User preference | `notifications/notification-preference/` | Per-user channel opt-ins. |
| Campaigns | `notifications/notification-campaign/` | Bulk-blast recipients model. |
| In-app inbox | `notifications/notification-inbox/` | API for fetching IN_APP messages for the current user. |
| Entitlement | `notifications/communication-entitlement/` | Per-school channel entitlement (which channels a school is allowed to use). |
| Event admin | `notifications/notification-event/notification-event.controller.ts:122` | Admin endpoint `/events/{key}/test-fire` to fire a synthetic event. |

The module is registered as `notifications.module.ts` and exposes a constants
file (`notifications.constants.ts`) and a domain-error file
(`notifications.errors.ts`).

**Verdict:** the *internal* notification framework already exists. What is
missing is (a) any working outbound channel and (b) any domain → dispatcher
wiring outside a small set of modules (see §4).

---

## 2. Existing Infrastructure

### 2.1 Dependencies (`backend/package.json:61-122`)

Every standard mail/queue SDK is **absent**:

| Library | Present? |
|---|---|
| `nodemailer` | no |
| `bullmq` / `bull` | no |
| `@nestjs-modules/mailer` | no |
| `handlebars` | no |
| `mjml` | no |
| `@aws-sdk/client-ses` | no |
| `aws-sdk` | no |
| `resend` | no |
| `@sendgrid/mail` | no |
| `mailgun.js` | no |
| `ioredis` | no |

Persistence is MySQL (`mysql2`) + Prisma only.

### 2.2 Env vars

`backend/.env.example` carries **no** `SMTP_*` / `MAIL_*` / `MAILER_*` /
`SES_*` / `SENDGRID_*` / `MAILGUN_*` / `RESEND_*` / `QUEUE_*` keys.
`REDIS_URL` and `REDIS_KEY_PREFIX` are commented-out Sprint 3 placeholders
(`backend/.env.example:67-68`).

`backend/src/core/config/env.schema.ts:99-100` declares the same two Redis
keys as `.optional()`. No mail or queue keys are validated.

### 2.3 Docker compose (`backend/docker/docker-compose.yml`)

Two services only:
- `mysql` (lines 17–45)
- `api` (lines 47–76)

No `redis`, no `mailpit`, no `mailhog`. The file header (line 1) reads
verbatim: *"Sprint 1 compose: API + MySQL 8. Redis + Mailhog land in
Sprint 3."* Sprint 3 has not landed that change.

**Verdict:** there is **no transport** (no SMTP server, no SES SDK, no Redis,
no Bull) wired into the running stack. Everything is in-process and
DB-backed.

---

## 3. Existing Email Templates

**None on disk.** A Glob for `**/*.{hbs,mjml,email.html}` under `backend/`
returned zero hits.

Templates live in the **database** instead, under two Prisma models in
`backend/prisma/schema/notifications.prisma`:

- `NotificationTemplate` (line 136) — per-school template definition
  (`eventKey`, `channel`, `name`, …).
- `NotificationTemplateVersion` (line 175) — each template has versioned
  bodies: `subject`, `bodyHtml`, `bodyText`, plus `vars` schema.

Rendering uses an in-house regex engine at
`backend/src/core/notifications/notification-renderer/notification-template-renderer.ts:34`:

```ts
const TOKEN_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
```

`escapeHtml` is applied to substitutions inside `bodyHtml` (lines 36–43);
plain substitution for `subject` and `bodyText` (lines 45–57).
`renderTemplateForChannel` (line 76) enforces channel rules: EMAIL keeps
subject + HTML; SMS/WHATSAPP/PUSH/IN_APP drop subject and HTML.

There is **no** Handlebars, MJML, Liquid, or partials/layout system. There
are no shipped template seeds for transactional events (welcome,
password-reset, school-provisioned, etc.).

---

## 4. Existing Notification Events

### 4.1 Catalog vs. wired

`backend/src/core/notifications/notification-events.catalog.ts` declares the
allowable event keys statically (Sprint 10 ships the catalog). The same file
documents at lines 16–19 that domain owners must wire `eventDispatcher.dispatch(...)`
calls themselves: *"Sprint 10 SHIPS the registry but does NOT wire it from
the existing domains … Each domain owner will add … calls in their own
Sprint 10.1 follow-on."*

### 4.2 Where the dispatcher is actually called

Grep across `backend/src` for `NotificationEventDispatcherService` / `.dispatch(` calls outside the
notifications module itself and outside tests returns exactly these sites:

| Domain | File:line |
|---|---|
| Academic — homework | `core/academic-content/homework/homework.service.ts:429` |
| Academic — assignment | `core/academic-content/assignment/assignment.service.ts:395` |
| Academic — submission | `core/academic-content/assignment-submission/assignment-submission.service.ts:375`, `:392` |
| Calendar — event | `core/events/event/event.service.ts:595` |
| Reporting — import | `core/reporting/import/import-commit.handler.ts:262`, `import-run.handler.ts:251` |
| Reporting — bulk op | `core/reporting/bulk-operation/bulk-op-execute.handler.ts:173` |
| Reporting — report | `core/reporting/report/report-run.handler.ts:216` |
| Admin test-fire | `core/notifications/notification-event/notification-event.controller.ts:122` |

### 4.3 Per-category coverage

| Category | Event | Wired? |
|---|---|---|
| **Auth** | login | ❌ no |
| | password-reset requested | ❌ no |
| | password-reset confirmed | ❌ no |
| | first-login forced change | ❌ no |
| **Platform** | school provisioned | ❌ no |
| | user invited | ❌ no |
| **School** | student enrolled / promoted | ❌ no |
| | parent linked | ❌ no |
| | staff onboarded | ❌ no |
| **ERP** | attendance posted | ❌ no |
| | fees invoice generated / paid | ❌ no |
| | examination result published | ❌ no |
| | timetable change | ❌ no |
| **Academic** | homework published | ✅ wired |
| | assignment published | ✅ wired |
| | submission graded / returned | ✅ wired |
| | calendar event | ✅ wired |
| **Reporting** | import commit / run | ✅ wired |
| | bulk-op execute | ✅ wired |
| | report run finished | ✅ wired |

**Verdict:** **~30% of declared event categories** are emitting through the
dispatcher today. Auth, provisioning, admission, attendance, fees,
examination, timetable, and staff modules emit only to the **outbox**
(domain events) and do **not** call the notification dispatcher.

---

## 5. Existing Queue / Outbox

The project uses a **DB-backed outbox + DB-backed job queue** — no Redis,
no BullMQ, no Kafka.

### 5.1 Outbox

- Model: `Outbox` in `backend/prisma/schema/ops.prisma:26`.
- Publisher: `backend/src/core/outbox/services/outbox-publisher.service.ts` (writes a row in the same Prisma transaction as the domain change).
- Relay: `backend/src/core/outbox/services/outbox-dispatcher.service.ts` (in-process `setInterval` poll → topic handlers).
- Notification-specific consumer: `backend/src/core/notifications/notification-dispatcher/notification-queued.outbox-handler.ts` listens for topic `notification.queued`, schedules a Job row.

### 5.2 Job queue

- Models in `backend/prisma/schema/ops.prisma`: `Job` (line 94), `JobDefinition` (line 154), `JobRun` (line 184), `JobDeadLetter` (line 218).
- Services:
  - `core/jobs/services/job-enqueue.service.ts`
  - `core/jobs/services/job-scheduler.service.ts`
  - `core/jobs/services/job-processor.service.ts`
- Notification-specific handler: `core/notifications/notification-dispatcher/notification-send.job-handler.ts` — pulls a NotificationMessage row by id, picks the channel adapter, calls `.send()`.

### 5.3 Sequence

```
domain.service.dispatch(...)
   └─ NotificationEventDispatcherService.dispatch
        └─ writes NotificationMessage(status=QUEUED) + Outbox(topic=notification.queued)
              └─ outbox-dispatcher poll → notification-queued.outbox-handler
                    └─ Job row enqueued (kind=notification.send)
                          └─ job-processor → notification-send.job-handler
                                └─ channel.adapter.send(...)
```

**Verdict:** the persistence and orchestration is **fully in place**. What is
missing is the leaf — the actual transport call (§6).

---

## 6. Existing SMTP / SES Support

**None of the channel adapters actually deliver.** Each provider adapter
contains a one-line implementation that throws:

| Adapter | File:line | Status |
|---|---|---|
| Amazon SES | `notifications/channels/adapters/ses.adapter.ts:25` | `throw new CommunicationChannelNotImplementedError(...)` |
| SendGrid | `notifications/channels/adapters/sendgrid.adapter.ts:25` | stub |
| MSG91 (SMS — IN) | `notifications/channels/adapters/msg91.adapter.ts:25` | stub |
| Twilio (SMS — global) | `notifications/channels/adapters/twilio.adapter.ts:25` | stub |
| WhatsApp BA | `notifications/channels/adapters/waba.adapter.ts:25` | stub |
| **IN_APP** | `notifications/channels/adapters/in-app.adapter.ts:27-33` | **functional** — returns `{providerStatus: 'DELIVERED'}` (no-op; the dispatcher already wrote the row that the inbox API reads). |

There is **no** SMTP transport. There is **no** AWS SDK. There is **no**
provider HTTP client wired anywhere. The only "delivered" path today is
IN_APP, and only because the database write *is* the delivery.

---

## 7. Missing Components

To make outbound notifications functional from end-to-end, the following are
absent:

1. **An email transport.** No SMTP client (`nodemailer`), no SES SDK, no
   transactional provider SDK. Picking one is the first decision.
2. **An email transport adapter that's not a stub.** Today `ses.adapter.ts`
   throws — a real implementation is needed (whether it actually calls SES
   or sends via SMTP/Mailpit locally).
3. **SMTP/Mail env keys.** `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, or the equivalent SES/SendGrid
   keys. Today `env.schema.ts` has none.
4. **A local SMTP sink** (Mailpit) for dev — see §9.
5. **Domain → dispatcher wiring** for the categories not wired today
   (auth, provisioning, attendance, fees, examination, timetable, staff,
   admission). See §4.3.
6. **Seeded transactional templates** in `NotificationTemplate`/Version
   rows: `auth.password_reset.requested`, `auth.first_login.invited`,
   `school.provisioned`, `student.enrolled`, etc. Today there are no
   template seeds.
7. **A worker process strategy.** The job processor runs in-process via
   `setInterval`. That's fine for dev; for prod we eventually need either a
   separate worker container or an explicit decision to keep it in-process.
8. **Retry / backoff policy on send failures.** The Job model supports it
   (`JobRun` + `JobDeadLetter`), but the notification send handler's retry
   ceiling and dead-letter rules need to be set deliberately, not
   inherited from defaults.
9. **Bounce / complaint handling** for email (SES SNS, SendGrid webhooks).
   Not in scope of the current schema — `NotificationMessageEvent` could
   absorb the events but no webhook endpoint exists.
10. **No tests** for an actual email send. The dispatcher has tests; no
    integration test runs against an SMTP sink because none exists.

---

## 8. Recommended Architecture

The existing scaffolding is **strong enough that no redesign is needed.**
The recommended path is to fill the leaf and the wiring, not to rebuild.

```
┌─────────────────────────┐
│ Domain Service          │ e.g. password-reset.service.ts
│ (auth / provisioning /  │
│ attendance / fees …)    │
└──────────┬──────────────┘
           │ eventDispatcher.dispatch({eventKey, recipients, vars, schoolId})
           ▼
┌─────────────────────────┐
│ NotificationEvent       │
│ DispatcherService       │ — writes NotificationMessage(QUEUED) + Outbox row
└──────────┬──────────────┘
           │ topic = notification.queued
           ▼
┌─────────────────────────┐
│ Outbox dispatcher       │ — in-process setInterval relay
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ notification-queued     │ — enqueues Job(kind=notification.send)
│ outbox handler          │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Job processor           │ — polls Job table, runs handler
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ notification-send       │ — loads NotificationMessage, picks adapter
│ job handler             │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐      EMAIL → SES adapter (replace stub with
│ Channel adapter         │              real Nodemailer/SES/SMTP client)
│ registry → adapter      │      SMS   → MSG91 / Twilio (Phase 2)
└──────────┬──────────────┘      WABA  → Phase 2
           │ HTTP / SMTP
           ▼
┌─────────────────────────┐
│ External provider       │ — Mailpit in dev, SES/SMTP in prod
└─────────────────────────┘
```

**Concrete recommendation:**

1. Add `nodemailer` as the email transport. Use one transport interface for
   both dev (Mailpit SMTP on `:1025`) and prod (SES SMTP credentials or
   any other transactional SMTP provider). One library, one code path,
   one set of integration tests — production swaps the host.
2. Replace `ses.adapter.ts` with a real Nodemailer-backed `EmailAdapter`
   (or add a new `nodemailer.adapter.ts` and have `EmailChannelRegistry`
   choose by env). Keep `ses.adapter.ts` as a thin wrapper for AWS-native
   sending if/when we go that route.
3. Add `MAIL_TRANSPORT` (smtp | ses | sendgrid), `MAIL_FROM`, `SMTP_*`
   keys to `env.schema.ts`.
4. Add `mailpit` to `docker/docker-compose.yml` exposing `1025` (SMTP) +
   `8025` (UI). No prod impact — dev-profile only.
5. Wire the **auth + provisioning** dispatchers next (highest user-visible
   value): on `auth.password_reset.requested`, on `auth.first_login.invited`,
   on `school.provisioned`. These three unlock the demo experience.
6. Seed `NotificationTemplate` rows for those three events as part of the
   same sprint so a fresh DB has working transactional emails.

Everything else (SMS, WhatsApp, bounce/complaint, separate worker container)
can wait — it's purely additive on top of the same skeleton.

---

## 9. Recommended Local Email Testing Tool

**Mailpit** — strongly recommended over Mailhog, Mailinator, and Ethereal.

| Tool | Maintained? | Self-hosted? | API/SMTP | Notes |
|---|---|---|---|---|
| **Mailpit** | ✅ active (`axllent/mailpit`) | ✅ single Go binary or Docker image | SMTP `:1025`, HTTPS UI `:8025`, REST API for tests | Successor to Mailhog. Tagged container, ~20 MB image. |
| Mailhog | ❌ archived 2020 | ✅ | SMTP / HTTP | Last release 2020; security-bug-riddled. Avoid. |
| Mailinator | ✅ active | ❌ hosted only | requires public DNS, network egress | Wrong tool for a local dev loop; tests would need network. |
| Ethereal | ✅ active | ❌ hosted only | unique per-test inbox; SMTP only | Suitable for one-off Nodemailer demos; awkward for repeatable dev. |

**Why Mailpit specifically:**
- Drop-in SMTP sink — Nodemailer/SES SMTP point at `host: 'localhost', port: 1025`.
- Web UI at `:8025` to eyeball rendered emails during dev (HTML + plain
  side by side, attachments, raw source).
- REST API at `/api/v1/messages` for integration tests to assert "an email
  was sent to X with subject Y".
- One container, no Redis dependency, no external network call.
- Already foreshadowed in `docker/docker-compose.yml:1` (Sprint 1 comment
  mentions Mailhog — Mailpit is the modern equivalent and the natural
  swap).

Suggested compose snippet (NOT applied — recommendation only):

```yaml
mailpit:
  image: axllent/mailpit:latest
  ports:
    - "1025:1025"   # SMTP
    - "8025:8025"   # Web UI
  environment:
    MP_SMTP_AUTH_ACCEPT_ANY: 1
    MP_SMTP_AUTH_ALLOW_INSECURE: 1
```

---

## 10. Implementation Readiness

| Dimension | Status |
|---|---|
| Domain model (templates / messages / events / preferences / campaigns) | **100 %** — 8 Prisma models exist. |
| Dispatcher service | **100 %** — implemented, tested, working. |
| Outbox + job orchestration | **100 %** — DB-backed, in-process relay, fully working. |
| Channel registry | **100 %** — registers adapters, validates allow-lists. |
| Template rendering | **100 %** for `{{token}}` semantics. **0 %** for partials/layouts/MJML — out of scope today. |
| IN_APP channel | **100 %** — working end-to-end. |
| EMAIL channel | **10 %** — adapter file exists but is a stub; no transport library; no SMTP env; no template seeds. |
| SMS / WhatsApp channels | **5 %** — stub adapters only. Deferred. |
| Domain → dispatcher wiring | **~30 %** — academic, calendar, reporting wired. Auth, provisioning, admission, attendance, fees, examination, timetable, staff **not** wired. |
| Local mail sink (Mailpit/Mailhog) | **0 %** — not in compose. |
| Bounce / complaint webhooks | **0 %** — out of scope today. |
| Worker isolation | **N/A** — in-process by design. |

**Overall framework readiness: ≈ 55 – 60 %.**

The expensive parts (schema, dispatcher, outbox, job queue, channel
registry, template engine, message log, preferences, entitlement) are
**done**. What remains is comparatively cheap, well-scoped work:

1. Pick a transport library (Nodemailer recommended).
2. Replace the SES adapter stub with a real implementation.
3. Add SMTP env keys + validate them.
4. Add Mailpit to compose.
5. Wire `auth` + `provisioning` domains to dispatch their events.
6. Seed three transactional templates.

That sequence is one focused sprint of backend work — no architectural
rewrite, no breaking change to existing modules.

---

## Stop

Audit only. No code, schema, env, compose, or doc outside this report
was modified during this task.
