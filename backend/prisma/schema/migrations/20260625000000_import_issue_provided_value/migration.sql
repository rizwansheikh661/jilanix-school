-- ============================================================================
-- Migration: 20260625000000_import_issue_provided_value
-- ----------------------------------------------------------------------------
-- Sprint 13.1 Patch C — adds a `provided_value` column to
-- `import_job_issues` so the validator can surface the user-supplied cell
-- value alongside the validation error message in error-report exports
-- (issues.csv / issues.xlsx) and in the validation-summary response shape.
--
-- Nullable VARCHAR(500) — sized to match the convention shared with the
-- repository (`providedValue.slice(0, 500)`); column may be NULL when the
-- issue is row-level (no columnName) or commit-time (no cell snapshot).
-- ============================================================================

ALTER TABLE `import_job_issues`
  ADD COLUMN `provided_value` VARCHAR(500) NULL AFTER `message`;
