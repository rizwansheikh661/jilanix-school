-- ---------------------------------------------------------------------------
-- 20260620_000100_apply_collation_charset
--
-- Intent     : Belt-and-braces enforcement of utf8mb4_0900_ai_ci on every
--              table and column the application owns. The compose-time
--              my.cnf already sets defaults, but operators occasionally
--              spin up MySQL with an inherited config (managed RDS, etc.)
--              and miss the server-level setting. Re-running this is safe.
-- Online     : yes (ALTER TABLE ... CONVERT TO CHARACTER SET is INPLACE on
--              utf8mb4-clean tables in MySQL 8).
-- Rollback   : not required — converting from utf8mb4 to a narrower charset
--              is unsafe and unsupported.
-- DependsOn  : Prisma init migration (so the schema exists).
-- Author     : SchoolOS platform team
-- Ticket     : SPRINT-1 / MYSQL_SETUP
-- ---------------------------------------------------------------------------

-- Database default
ALTER DATABASE `schoolos`
  CHARACTER SET = utf8mb4
  COLLATE       = utf8mb4_0900_ai_ci;

-- Convert each application-owned table. We list explicitly so that this
-- file is reviewable; new tables added in later migrations get utf8mb4 from
-- the database default + Prisma codegen, and a CI lint guards against any
-- table created without it.

-- Sprint 1 tables (run as a no-op when not yet present — we assume init
-- migration has run; failures here are a real problem).
SET @tables := (
  SELECT GROUP_CONCAT(QUOTE(TABLE_NAME))
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'schoolos'
    AND TABLE_TYPE = 'BASE TABLE'
);

-- Generate ALTER per table dynamically. We avoid hand-rolling each ALTER
-- so this script stays correct as new tables land in later sprints.
DELIMITER $$
DROP PROCEDURE IF EXISTS schoolos_apply_utf8mb4 $$
CREATE PROCEDURE schoolos_apply_utf8mb4()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tname VARCHAR(255);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'schoolos'
      AND TABLE_TYPE   = 'BASE TABLE';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tname;
    IF done = 1 THEN LEAVE read_loop; END IF;
    SET @sql := CONCAT(
      'ALTER TABLE `schoolos`.`', tname, '` ',
      'CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;
  CLOSE cur;
END $$
DELIMITER ;

CALL schoolos_apply_utf8mb4();
DROP PROCEDURE schoolos_apply_utf8mb4;
