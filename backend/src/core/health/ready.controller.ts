import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../auth';
import { PrismaService } from '../../infra/prisma';

type CheckStatus = 'ok' | 'degraded' | 'down';

interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Record<string, { status: CheckStatus; latencyMs?: number; message?: string }>;
  timestamp: string;
}

/**
 * Readiness probe.
 *
 * Sprint 1 dependencies wired into the gate:
 *   - MySQL (Prisma `SELECT 1`)
 *
 * Returns 200 only when every dependency reports `ok`. Anything else
 * returns 503 with the same body so monitoring agents can pick up which
 * dependency is unhealthy without needing to parse text.
 */
@ApiTags('Health')
@Public()
@Controller({ path: 'ready', version: VERSION_NEUTRAL })
export class ReadyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe — service is ready to accept traffic.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ready' },
        checks: { type: 'object', additionalProperties: true },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'One or more dependencies are unhealthy.' })
  public async check(): Promise<ReadinessReport> {
    const checks: ReadinessReport['checks'] = { process: { status: 'ok' } };

    try {
      const { latencyMs } = await this.prisma.ping();
      checks.database = { status: 'ok', latencyMs };
    } catch (error) {
      checks.database = {
        status: 'down',
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    const report: ReadinessReport = {
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };

    if (!allOk) {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }
}
