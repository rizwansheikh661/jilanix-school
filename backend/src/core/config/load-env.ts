import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseDotenv } from 'dotenv';

/**
 * Resolve env-file load order. Later wins.
 *
 * Standard cascade (inspired by `dotenv-flow`):
 *   1. .env                       — committed defaults (rare; usually empty)
 *   2. .env.<NODE_ENV>            — committed per-env defaults
 *   3. .env.local                 — developer overrides (gitignored)
 *   4. .env.<NODE_ENV>.local      — developer per-env overrides (gitignored)
 *
 * `.env.local` and `.env.test*` rules:
 *   - In `test`, `.env.local` is intentionally skipped so unit tests are
 *     reproducible regardless of the developer's machine.
 *
 * The function does not throw when a file is missing — that is expected.
 * It throws only when a file is unreadable / malformed.
 */
export interface LoadEnvOptions {
  cwd?: string;
  nodeEnv?: string;
  override?: boolean;
}

export interface LoadedFile {
  path: string;
  loaded: boolean;
  keys: number;
}

export function loadEnvFiles(options: LoadEnvOptions = {}): LoadedFile[] {
  const cwd = options.cwd ?? process.cwd();
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const override = options.override ?? false;

  const candidates: string[] = ['.env', `.env.${nodeEnv}`];
  if (nodeEnv !== 'test') {
    candidates.push('.env.local', `.env.${nodeEnv}.local`);
  }

  const results: LoadedFile[] = [];
  for (const file of candidates) {
    const absolute = resolve(cwd, file);
    if (!existsSync(absolute)) {
      results.push({ path: absolute, loaded: false, keys: 0 });
      continue;
    }
    const raw = readFileSync(absolute, 'utf8');
    const parsed = parseDotenv(raw);
    let count = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
        count += 1;
      }
    }
    results.push({ path: absolute, loaded: true, keys: count });
  }
  return results;
}
