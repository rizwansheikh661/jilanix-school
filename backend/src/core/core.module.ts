import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from '../infra/prisma';
import { CryptoModule } from '../infra/crypto';
import { AcademicModule } from './academic';
import { AcademicContentModule } from './academic-content';
import { AdmissionModule } from './admission';
import { AttendanceModule } from './attendance';
import { AuditInterceptor, AuditModule } from './audit';
import { AuthModule, JwtAuthGuard } from './auth';
import { BillingModule } from './billing/billing.module';
import { BranchModule } from './branch';
import { CalendarModule } from './calendar';
import { CommunicationCenterModule } from './communication-center/communication-center.module';
import { ConfigModule } from './config';
import { EventsModule } from './events';
import { ExaminationModule } from './examination';
import { FeatureFlagModule } from './feature-flag';
import { FeesModule } from './fees';
import { FileStorageModule } from './file-storage';
import { HealthModule } from './health/health.module';
import { HouseModule } from './house';
import { GlobalExceptionFilter, ResponseEnvelopeInterceptor } from './http';
import { IdempotencyModule } from './idempotency';
import { JobsModule } from './jobs';
import { LoggerModule } from './logger';
import { NotificationsModule } from './notifications';
import { OrganizationModule } from './organization';
import { OutboxModule } from './outbox';
import { ParentModule } from './parent';
import { PermissionsGuard, RbacModule } from './rbac';
import { ReportingModule } from './reporting';
import { RequestContextInterceptor, RequestContextMiddleware, RequestContextModule, TenantResolverMiddleware } from './request-context';
import { RoomModule } from './room';
import { ProvisioningModule } from './provisioning';
import { SchoolModule } from './school';
import { SequencesModule } from './sequences';
import { StaffModule } from './staff';
import { StudentModule } from './student';
import { SubscriptionModule, SubscriptionWriteGuardInterceptor } from './subscription';
import { TimetableModule } from './timetable';

/**
 * CoreModule aggregates cross-cutting infrastructure that every feature
 * module relies on. Sprint 1 modules wired so far:
 *   - ConfigModule          (typed env)
 *   - LoggerModule          (Pino + structured fields)
 *   - RequestContextModule  (AsyncLocalStorage carrier + middleware)
 *   - PrismaModule          (DB access via 5-extension stack)
 *   - AuditModule           (audit foundation + finance hash chain)
 *   - AuthModule            (JWT + refresh rotation + sessions)
 *   - RbacModule            (roles, permissions, PermissionsGuard)
 *   - HealthModule          (liveness/readiness/version)
 *
 * Middleware order (configure):
 *   1. RequestContextMiddleware — runs FIRST on every route so every
 *      handler downstream sees a bound RequestContext via ALS. pino-http
 *      runs before this through `nestjs-pino` and seeds `req.id`; the
 *      middleware reuses that id rather than generating a new one.
 *
 * Global HTTP plumbing (declared as APP_* providers so feature modules
 * inherit them automatically):
 *   - ResponseEnvelopeInterceptor — wraps success returns in `{ data, meta }`.
 *     Registered first so it's the OUTERMOST interceptor; downstream
 *     interceptors see the raw handler return.
 *   - AuditInterceptor — drains `@Audit(...)` metadata into AuditService.
 *     Registered after the envelope so it observes raw payloads.
 *   - JwtAuthGuard — global guard; routes opt out via `@Public()`. Runs
 *     after the middleware has bound a base context, then upgrades that
 *     context with the authenticated principal.
 *   - PermissionsGuard — global guard; runs after JwtAuthGuard. No-op
 *     unless a route declares @RequirePermissions / @RequireAnyPermission /
 *     @RequireRole, in which case it enforces and stamps resolved
 *     permissions onto the RequestContext.
 *   - GlobalExceptionFilter — catches every error, maps to the canonical
 *     error envelope, logs once with structured fields.
 *
 * Future sprints add: RateLimitModule, ...
 * — all imported here so AppModule stays a thin composition root.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    RequestContextModule,
    PrismaModule,
    CryptoModule,
    AuditModule,
    RbacModule,
    AuthModule,
    AcademicModule,
    StudentModule,
    ParentModule,
    AdmissionModule,
    SequencesModule,
    StaffModule,
    SchoolModule,
    BranchModule,
    OrganizationModule,
    HouseModule,
    RoomModule,
    CalendarModule,
    HealthModule,
    FileStorageModule,
    OutboxModule,
    JobsModule,
    FeatureFlagModule,
    IdempotencyModule,
    AttendanceModule,
    TimetableModule,
    ExaminationModule,
    FeesModule,
    NotificationsModule,
    EventsModule,
    AcademicContentModule,
    ReportingModule,
    ProvisioningModule,
    SubscriptionModule,
    BillingModule,
    CommunicationCenterModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // RequestContextInterceptor must wrap AuditInterceptor + handler so the
    // audit log + every controller await runs inside the principal-aware
    // ALS frame re-bound from req.user + req.resolvedTenant. See
    // request-context.interceptor.ts for the lifecycle commentary.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SubscriptionWriteGuardInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [
    ConfigModule,
    LoggerModule,
    RequestContextModule,
    PrismaModule,
    AuditModule,
    RbacModule,
    AuthModule,
  ],
})
export class CoreModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    // Order matters: TenantResolver runs first so `req.resolvedTenant` is
    // populated before RequestContextMiddleware binds the ALS context. Auth
    // layers in later waves lift the resolved schoolId onto the bound
    // context. See AUTH_W1_1_IMPLEMENTATION_REPORT.md.
    consumer.apply(TenantResolverMiddleware, RequestContextMiddleware).forRoutes('*');
  }
}
