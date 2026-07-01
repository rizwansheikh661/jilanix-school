-- Sprint N3 — School Branding Foundation.
--
-- Extends `school_branding` so the Email Design System renderer (and
-- future Login pages / PDF reports / Invoices / Public Portal) has a
-- single per-tenant source of truth. Every column is nullable; missing
-- values fall back to SchoolOS defaults at render time.
--
-- Additive only.

ALTER TABLE `school_branding`
  ADD COLUMN `short_name`           VARCHAR(40)   NULL AFTER `school_id`,
  ADD COLUMN `dark_logo_url`        VARCHAR(1000) NULL AFTER `logo_url`,
  ADD COLUMN `login_background_url` VARCHAR(1000) NULL AFTER `letterhead_url`,
  ADD COLUMN `email_banner_url`     VARCHAR(1000) NULL AFTER `login_background_url`,
  ADD COLUMN `pdf_header_url`       VARCHAR(1000) NULL AFTER `email_banner_url`,
  ADD COLUMN `pdf_footer_url`       VARCHAR(1000) NULL AFTER `pdf_header_url`,
  ADD COLUMN `support_email`        VARCHAR(255)  NULL AFTER `font_family`,
  ADD COLUMN `support_phone`        VARCHAR(40)   NULL AFTER `support_email`,
  ADD COLUMN `website_url`          VARCHAR(500)  NULL AFTER `support_phone`,
  ADD COLUMN `footer_text`          VARCHAR(500)  NULL AFTER `website_url`,
  ADD COLUMN `copyright_text`       VARCHAR(255)  NULL AFTER `footer_text`,
  ADD COLUMN `social_links_json`    JSON          NULL AFTER `copyright_text`;
