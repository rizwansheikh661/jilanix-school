import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth';
import { ConfigService } from '../config';

/**
 * Version endpoint.
 *
 * Reports the build identity of the running container so on-call can confirm
 * which release is live without shelling in. The git SHA and build timestamp
 * are injected at container build time via APP_BUILD_SHA / APP_BUILD_TIME.
 * When unset (e.g. local dev), `unknown` is returned.
 */
@ApiTags('Health')
@Public()
@Controller({ path: 'version', version: VERSION_NEUTRAL })
export class VersionController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Build identity — name, version, commit SHA, build time.' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'schoolos-api' },
        version: { type: 'string', example: '0.1.0' },
        environment: { type: 'string', example: 'development' },
        commit: { type: 'string', example: 'a1b2c3d' },
        buildTime: { type: 'string', example: '2026-06-17T08:00:00.000Z' },
      },
    },
  })
  public info(): {
    name: string;
    version: string;
    environment: string;
    commit: string;
    buildTime: string;
  } {
    const app = this.config.app;
    return {
      name: app.name,
      version: app.version,
      environment: app.env,
      commit: app.build.commit,
      buildTime: app.build.time,
    };
  }
}
