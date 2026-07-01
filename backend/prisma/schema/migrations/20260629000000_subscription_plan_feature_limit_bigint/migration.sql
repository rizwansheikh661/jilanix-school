-- ============================================================================
-- 20260629000000 — Hotfix 15.0.2: widen plan_features.limit from INT to BIGINT.
--
-- Context: Sprint 15 declared `plan_features.limit` as INT, which caps at
-- 2,147,483,647 (~2.1 GB). The STARTER and GROWTH plans seed storage_bytes
-- limits well above that (5/10 GiB and 50/100 GiB respectively), so the
-- PlanFeatureSeeder failed at boot with
--   "Value out of range for the type: Out of range value for column 'limit'".
--
-- Fix:
--   1. ALTER `plan_features.limit` to BIGINT NULL — large enough for any
--      realistic storage upgrade (BIGINT MAX ≈ 9.2 × 10^18).
--   2. Update any storage_bytes rows whose limit was silently clipped by the
--      original migration's INSERT IGNORE to MySQL INT MAX. Idempotent — only
--      touches rows that match the clipped sentinel.
--
-- All non-storage LIMIT keys (student_count, staff_count, branch_count,
-- email/sms/whatsapp monthly) already fit in INT; this widening is harmless
-- for them. The repository narrows BIGINT → JS Number at the boundary,
-- preserving the existing `number | null` shape exposed to the rest of the
-- subscription module.
-- ============================================================================

ALTER TABLE `plan_features`
  MODIFY COLUMN `limit` BIGINT NULL;

-- Repair any storage_bytes rows clipped to INT MAX (2147483647) by the
-- previous migration. The application-side seeder will also resync these on
-- next boot, but this SQL keeps the DB consistent without requiring a boot.
UPDATE `plan_features` pf
JOIN `plans` p ON p.`id` = pf.`plan_id`
SET pf.`limit` = 10737418240
WHERE pf.`feature_key` = 'storage_bytes'
  AND p.`code` = 'STARTER'
  AND pf.`limit` = 2147483647;

UPDATE `plan_features` pf
JOIN `plans` p ON p.`id` = pf.`plan_id`
SET pf.`limit` = 107374182400
WHERE pf.`feature_key` = 'storage_bytes'
  AND p.`code` = 'GROWTH'
  AND pf.`limit` = 2147483647;
