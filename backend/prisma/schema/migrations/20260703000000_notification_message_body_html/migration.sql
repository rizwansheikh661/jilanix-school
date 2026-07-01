-- Sprint N2 — SchoolOS Email Design System
--
-- The notification dispatcher already renders the EMAIL bodyHtml fragment
-- into the base layout at the time it creates the NotificationMessage row,
-- but until now there was no column to persist that rendered HTML — the
-- send-job handler then had to pass `null` to the channel adapter, and
-- subscribers received text-only emails.
--
-- This migration adds the missing slot. Additive only:
--   * notification_messages.body_html_rendered TEXT NULL
--
-- Backward compatible: existing rows keep NULL bodyHtml; the adapter still
-- accepts null and falls back to text-only delivery.

ALTER TABLE `notification_messages`
  ADD COLUMN `body_html_rendered` TEXT NULL AFTER `body_rendered`;
