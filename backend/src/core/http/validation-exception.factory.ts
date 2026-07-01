/**
 * Throws a typed `ValidationFailedError` from class-validator output so
 * the global filter doesn't have to inspect Nest's BadRequest shape at
 * runtime. Wired via the global ValidationPipe in `apps/api/main.ts`.
 *
 * Per BACKEND_ARCHITECTURE §12.2 the pipe runs with
 * `{ whitelist, forbidNonWhitelisted, transform }` — see the bootstrap.
 */
import type { ValidationError } from '@nestjs/common';

import type { FieldIssue } from '../../contracts/api';
import { ValidationFailedError } from '../errors';

export function validationExceptionFactory(errors: ValidationError[]): ValidationFailedError {
  const fields: FieldIssue[] = [];
  for (const err of errors) {
    collect(err, '', fields);
  }
  return new ValidationFailedError(fields);
}

function collect(error: ValidationError, parentPath: string, out: FieldIssue[]): void {
  const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`;
  if (error.constraints !== undefined) {
    for (const [code, message] of Object.entries(error.constraints)) {
      out.push({ path, code: code.toUpperCase(), message });
    }
  }
  if (error.children !== undefined && error.children.length > 0) {
    for (const child of error.children) {
      collect(child, path, out);
    }
  }
}
