/* Sprint 13 reporting foundation verification script */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLES = [
  'report_runs',
  'import_jobs',
  'import_job_issues',
  'bulk_operations',
  'dashboards',
  'dashboard_widgets',
  'report_schedules',
  'report_templates',
];

const EXPECTED_ENUMS = {
  report_runs: {
    kind: 9,
    format: 3,
    status: 5,
  },
  import_jobs: {
    kind: 5,
    status: 7,
  },
  import_job_issues: {
    severity: 3,
  },
  bulk_operations: {
    kind: 7,
    mode: 3,
    status: 7,
  },
  dashboard_widgets: {
    kind: 7,
  },
  report_schedules: {
    frequency: 4,
  },
};

function parseEnumCount(colDef) {
  // colDef looks like: enum('A','B','C')
  const m = colDef.match(/^enum\(([^)]*)\)/i);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).length;
}

function extractEnumValues(colDef) {
  const m = colDef.match(/^enum\(([^)]*)\)/i);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

async function main() {
  console.log('\n=== TABLES EXIST ===');
  const tableResults = {};
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe(`SHOW TABLES LIKE '${t}'`);
    tableResults[t] = r.length > 0;
    console.log(`${t}: ${r.length > 0 ? 'EXISTS' : 'MISSING'}`);
  }

  console.log('\n=== ROW COUNTS ===');
  for (const t of TABLES) {
    if (!tableResults[t]) continue;
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
    console.log(`${t}: ${r[0].c}`);
  }

  console.log('\n=== ENUM VERIFICATION ===');
  for (const [table, cols] of Object.entries(EXPECTED_ENUMS)) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`,
    );
    for (const [colName, expectedCount] of Object.entries(cols)) {
      const row = rows.find((r) => r.COLUMN_NAME === colName);
      if (!row) {
        console.log(`${table}.${colName}: MISSING column`);
        continue;
      }
      const count = parseEnumCount(row.COLUMN_TYPE);
      const values = extractEnumValues(row.COLUMN_TYPE);
      const ok = count === expectedCount;
      console.log(
        `${table}.${colName}: ${count} values (expected ${expectedCount}) ${ok ? 'OK' : 'MISMATCH'} -> [${values?.join(',')}]`,
      );
    }
  }

  console.log('\n=== FOREIGN KEYS ===');
  for (const t of TABLES) {
    const fks = await prisma.$queryRawUnsafe(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    );
    console.log(`-- ${t} FKs (${fks.length}):`);
    for (const fk of fks) {
      console.log(
        `   ${fk.CONSTRAINT_NAME}: ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`,
      );
    }
  }

  console.log('\n=== INDEXES (counts per table) ===');
  for (const t of TABLES) {
    const idx = await prisma.$queryRawUnsafe(`SHOW INDEX FROM \`${t}\``);
    const uniq = new Set(idx.map((i) => i.Key_name));
    console.log(`${t}: ${uniq.size} indexes (${idx.length} columns); names: ${[...uniq].join(', ')}`);
  }

  console.log('\n=== STORED deleted_at_key COLUMNS ===');
  const STORED_TABLES = [
    'report_runs',
    'import_jobs',
    'bulk_operations',
    'dashboards',
    'report_schedules',
    'report_templates',
  ];
  for (const t of STORED_TABLES) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' AND COLUMN_NAME = 'deleted_at_key'`,
    );
    if (rows.length === 0) {
      console.log(`${t}.deleted_at_key: MISSING`);
    } else {
      console.log(`${t}.deleted_at_key: PRESENT (EXTRA=${rows[0].EXTRA})`);
    }
  }

  console.log('\n=== UNIQUE INDEXES uq_<table>_code_active ===');
  for (const t of STORED_TABLES) {
    const idx = await prisma.$queryRawUnsafe(`SHOW INDEX FROM \`${t}\``);
    const uqNames = [...new Set(idx.map((i) => i.Key_name))].filter((n) => /uq_.*_code_active$/i.test(n) || /code.*active/i.test(n));
    console.log(`${t}: ${uqNames.length > 0 ? uqNames.join(', ') : 'NONE FOUND'}`);
  }

  console.log('\n=== NO active-row uniqueness on import_job_issues, dashboard_widgets ===');
  for (const t of ['import_job_issues', 'dashboard_widgets']) {
    const idx = await prisma.$queryRawUnsafe(`SHOW INDEX FROM \`${t}\``);
    const uniq = idx.filter((i) => i.Non_unique === 0);
    const uniqNames = [...new Set(uniq.map((i) => i.Key_name))];
    console.log(`${t}: unique idx names = ${uniqNames.join(', ')}`);
  }

  console.log('\n=== TENANT ISOLATION ===');
  for (const t of TABLES) {
    const cols = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' AND COLUMN_NAME = 'school_id'`,
    );
    const pk = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`,
    );
    const pkCols = pk.map((p) => p.COLUMN_NAME);
    console.log(
      `${t}: school_id=${cols.length > 0 ? 'Y' : 'N'}, PK=(${pkCols.join(', ')})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
