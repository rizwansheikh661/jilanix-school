import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoNestLogger } from 'nestjs-pino';

import { AppModule } from '../../src/app.module';
import { ConfigService, EnvValidationError } from '../../src/core/config';
import { validationExceptionFactory } from '../../src/core/http';

/**
 * Bootstrap order (do not reorder casually):
 *   1. ConfigService.bootstrap() — fail fast on bad env BEFORE Nest initialises
 *      anything that may itself need config.
 *   2. NestFactory.create() — Nest container comes up with a frozen config
 *      snapshot already in place.
 *   3. Wire global middleware: helmet → compression → cookie-parser.
 *   4. CORS, body limit, global prefix, URI versioning.
 *   5. Global ValidationPipe (whitelist, transform, forbid extras).
 *   6. Swagger (gated by config; rejected in production by EnvSchema).
 *   7. Listen, then log the snapshot once.
 *
 * `ConfigService.logSnapshot()` runs AFTER listen so the boot summary is the
 * last line in the boot output — easy to grep, easy to compare across deploys.
 */
async function bootstrap(): Promise<void> {
  const configuration = ConfigService.bootstrap();
  const { app: appCfg, swagger: swaggerCfg } = configuration;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    cors: false,
    rawBody: true,
  });

  // Replace Nest's default ConsoleLogger with pino. `bufferLogs: true` above
  // ensures any boot-time framework logs (e.g. "Nest application starting")
  // are replayed through pino once `useLogger` is called below.
  app.useLogger(app.get(PinoNestLogger));

  if (appCfg.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: appCfg.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: appCfg.cors.origins.length > 0 ? [...appCfg.cors.origins] : false,
    credentials: appCfg.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Slug',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix(appCfg.globalPrefix, {
    exclude: ['health', 'ready', 'version'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: appCfg.apiVersion.replace(/^v/, ''),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  if (swaggerCfg.enabled) {
    const docConfig = new DocumentBuilder()
      .setTitle(swaggerCfg.title)
      .setDescription(swaggerCfg.description)
      .setVersion(swaggerCfg.version)
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addServer(appCfg.baseUrl)
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup(swaggerCfg.path, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  await app.listen(appCfg.port, appCfg.host);

  ConfigService.logSnapshot();

  const url = await app.getUrl();
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] ${appCfg.name}@${appCfg.version} listening on ${url}`);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof EnvValidationError) {
    // eslint-disable-next-line no-console
    console.error(error.message);
  } else {
    // eslint-disable-next-line no-console
    console.error('[bootstrap] fatal error', error);
  }
  process.exit(1);
});
