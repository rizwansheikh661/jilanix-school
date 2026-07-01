-- Manual migration: tenant_sequences fiscal_year_key computed column + unique.
--
-- Why this is hand-written:
--   Prisma's MySQL generator does not emit GENERATED ALWAYS AS (...) STORED
--   columns, so the canonical uniqueness for `(school_id, sequence_name,
--   fiscal_year)` cannot be expressed declaratively in schema.prisma. We
--   collapse NULL fiscal_year to the sentinel '__none__' inside a STORED
--   virtual column and put the UNIQUE there.
--
-- Why a sentinel:
--   MySQL treats NULLs in a UNIQUE index as distinct. Without the sentinel,
--   two rows for (school, 'employee', NULL) would both be accepted — breaking
--   gap-free counter semantics for evergreen sequences.

ALTER TABLE `tenant_sequences`
  ADD COLUMN `fiscal_year_key` VARCHAR(7) GENERATED ALWAYS AS
    (COALESCE(`fiscal_year`, '__none__')) STORED;

CREATE UNIQUE INDEX `uq_tenant_sequences_school_name_fy_key`
  ON `tenant_sequences` (`school_id`, `sequence_name`, `fiscal_year_key`);
