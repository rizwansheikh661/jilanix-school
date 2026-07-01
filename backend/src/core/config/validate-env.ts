import { ZodError } from 'zod';

import { EnvSchema, type RawEnv } from './env.schema';

/**
 * Validation error thrown by `validateEnv`. Aggregates every failure into a
 * single, multi-line message so that misconfigured deploys show all problems
 * at once rather than fixing one then surfacing the next.
 */
export class EnvValidationError extends Error {
  public readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    const lines = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
    super(`Environment validation failed:\n${lines}\n\nFix the variables above and restart.`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Parse and validate a record of raw env strings against EnvSchema.
 *
 * Returns the parsed (typed, coerced, defaulted) RawEnv on success; throws
 * an EnvValidationError listing all failures otherwise.
 */
export function validateEnv(raw: NodeJS.ProcessEnv): RawEnv {
  try {
    return EnvSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((issue) => ({
        path: issue.path.length === 0 ? '<root>' : issue.path.join('.'),
        message: issue.message,
      }));
      throw new EnvValidationError(issues);
    }
    throw error;
  }
}
