/**
 * Stand-alone env validator. Loads `.env*` files via the same loader the
 * runtime uses, then runs the Zod schema. Exits 0 on success, 1 with the
 * aggregated error message on failure.
 *
 * Usage:
 *   npm run validate:env
 *   NODE_ENV=production npm run validate:env
 *
 * This is the script CI runs against staging/prod env bundles before a deploy.
 */
/* eslint-disable no-console */
import { ConfigService, EnvValidationError } from '../src/core/config';

try {
  ConfigService.bootstrap({ force: true });
  console.log('[validate-env] OK');
  process.exit(0);
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
  } else {
    console.error('[validate-env] unexpected error', error);
  }
  process.exit(1);
}
