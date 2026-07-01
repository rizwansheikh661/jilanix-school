import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth';

/**
 * Liveness probe.
 *
 * Returns 200 as long as the Node process is responsive. Does NOT verify
 * downstream dependencies — that is the readiness probe's responsibility.
 * Kubernetes / load-balancers should hit this to decide whether to restart
 * the container.
 *
 * Exposed without an /api/v* prefix (excluded in main.ts) so probes do not
 * break across API version bumps.
 */
@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — process is up and responsive.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        uptimeSeconds: { type: 'number', example: 1234.56 },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  public check(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }
}
