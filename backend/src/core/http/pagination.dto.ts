/**
 * PaginationQueryDto — shared cursor-pagination query shape used by every
 * list endpoint per REST_API_DESIGN §0 (cursor by default, limit 1..200,
 * opaque cursor string).
 *
 * The global ValidationPipe (`apps/api/main.ts`) runs with
 * `enableImplicitConversion: false`, so `limit` requires an explicit
 * `@Type(() => Number)` to coerce the query-string value into a number
 * before the `@IsInt` check fires.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 200;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page size (1..200). Defaults to 50.',
    minimum: 1,
    maximum: PAGINATION_MAX_LIMIT,
    default: PAGINATION_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  public readonly limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor returned in the previous page response.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public readonly cursor?: string;
}

/**
 * Wire shape for paginated list responses. The global
 * `ResponseEnvelopeInterceptor` wraps this in `{ data, meta: { requestId } }`.
 */
export interface CursorPageDto<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
