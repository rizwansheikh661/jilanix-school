/**
 * Drift-check: every key declared in EnvSchema must have a placeholder line
 * in `.env.example`. Run in CI so a developer who adds a new env key without
 * documenting it fails fast.
 *
 * Usage:
 *   npm run check:env-example
 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EnvSchema } from '../src/core/config/env.schema';

const examplePath = resolve(__dirname, '..', '.env.example');
const raw = readFileSync(examplePath, 'utf8');

const declared = new Set<string>();
for (const line of raw.split(/\r?\n/)) {
  const stripped = line.replace(/^#\s*/, '').trim();
  const match = /^([A-Z][A-Z0-9_]*)=/.exec(stripped);
  if (match !== null) {
    declared.add(match[1]!);
  }
}

const schemaKeys = Object.keys(EnvSchema._def.schema.shape);
const missing = schemaKeys.filter((key) => !declared.has(key));

if (missing.length > 0) {
  console.error(
    `[check:env-example] Missing keys in .env.example:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nAdd them (commented if optional) and re-run.`,
  );
  process.exit(1);
}

console.log(`[check:env-example] OK — ${schemaKeys.length} keys documented.`);
