import { HttpStatus } from '@nestjs/common';

import { ERROR_CODES, type ErrorCode } from '../../contracts/api';

/**
 * Map every canonical error code to its HTTP status. Single source of
 * truth — the filter consults this when serialising a `DomainError`.
 *
 * §20 of API_STANDARDS pins these mappings; do not diverge per-route.
 */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, HttpStatus> = {
  [ERROR_CODES.VALIDATION_FAILED]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ERROR_CODES.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: HttpStatus.FORBIDDEN,
  [ERROR_CODES.RESOURCE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ERROR_CODES.VERSION_CONFLICT]: HttpStatus.CONFLICT,
  [ERROR_CODES.DUPLICATE_RESOURCE]: HttpStatus.CONFLICT,
  [ERROR_CODES.STATE_INVALID]: HttpStatus.CONFLICT,
  [ERROR_CODES.LOCKED_RESOURCE]: HttpStatus.LOCKED,
  [ERROR_CODES.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ERROR_CODES.EXTERNAL_PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [ERROR_CODES.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};
