/**
 * Demo-users seed (dev / staging only).
 *
 * Sprint W1.5-prep — five development accounts the backend smoke-tests
 * authenticate against end-to-end:
 *
 *   - `platform.admin@schoolos.local`       → `platform_admin` role, global scope.
 *                                              Parented under a sentinel
 *                                              `platform` school (`User.schoolId`
 *                                              is a non-null composite-PK
 *                                              column, so even global users
 *                                              need a row).
 *   - `school.admin@canary.local`           → `school_admin` role on the canary
 *                                              tenant (slug `canary`, seeded by
 *                                              `canary-tenant.ts`).
 *   - `teacher1@canary.local`               → `teacher` role on canary.
 *   - `parent1@canary.local`                → `parent` role on canary.
 *   - `20260001@students.canary.local`      → `student` role on canary,
 *                                              admissionNo `20260001`. The
 *                                              synthetic email is the
 *                                              login identifier until W1.5
 *                                              wires the admission-number
 *                                              lookup path.
 *
 * Idempotent: re-running upserts the same rows (users keyed on
 * `(schoolId, email)`; roles keyed on `key`; password rows keyed on
 * `(schoolId, userId)`). Re-seeding never duplicates.
 *
 * Passwords go through the same argon2id parameters and pepper the
 * runtime `PasswordService` uses, so `verify()` accepts these hashes on
 * login without flagging them for rehash.
 *
 * SECURITY: cleartext passwords below are obvious dev-only values and
 * the module is wired into `MODULES.dev` + `MODULES.staging` only — never
 * `prod-core`. Any environment that resembles production MUST rotate
 * these credentials immediately (or never run this seed there).
 */
import * as argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';

const PLATFORM_SCHOOL_SLUG = 'platform';
const CANARY_SCHOOL_SLUG = 'canary';

const ROLE_PLATFORM_ADMIN_KEY = 'platform_admin';
const ROLE_SCHOOL_ADMIN_KEY = 'school_admin';
const ROLE_TEACHER_KEY = 'teacher';
const ROLE_PARENT_KEY = 'parent';
const ROLE_STUDENT_KEY = 'student';

type SeedRoleKey =
  | typeof ROLE_PLATFORM_ADMIN_KEY
  | typeof ROLE_SCHOOL_ADMIN_KEY
  | typeof ROLE_TEACHER_KEY
  | typeof ROLE_PARENT_KEY
  | typeof ROLE_STUDENT_KEY;

type SeedSchoolSlug = typeof PLATFORM_SCHOOL_SLUG | typeof CANARY_SCHOOL_SLUG;

/**
 * Mirror of `DEFAULT_ARGON2_PARAMS` from
 * `backend/src/core/auth/password/password.service.ts`. Keeping these in
 * sync is enforced manually — if production calibration drifts, this
 * constant must move with it, otherwise seeded users would be flagged
 * for rehash on every login (harmless, but wasteful).
 */
const ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const ARGON2_PARAMS_JSON = {
  type: 'argon2id',
  memoryCost: ARGON2_PARAMS.memoryCost,
  timeCost: ARGON2_PARAMS.timeCost,
  parallelism: ARGON2_PARAMS.parallelism,
};

interface DemoUser {
  readonly slug: string;
  readonly schoolSlug: SeedSchoolSlug;
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly actorScope: 'tenant' | 'global';
  readonly roleKey: SeedRoleKey;
  /**
   * Present only for the student account — informational metadata so the
   * seed file (and later the verify pass) can assert the admission number
   * we promised. The User row itself has no admission column; the lookup
   * by admission number is wired in W1.5 via the Student table.
   */
  readonly admissionNo?: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    slug: 'platform-admin',
    schoolSlug: PLATFORM_SCHOOL_SLUG,
    email: 'platform.admin@schoolos.local',
    password: 'Admin@123',
    displayName: 'Platform Admin (demo)',
    actorScope: 'global',
    roleKey: ROLE_PLATFORM_ADMIN_KEY,
  },
  {
    slug: 'canary-school-admin',
    schoolSlug: CANARY_SCHOOL_SLUG,
    email: 'school.admin@canary.local',
    password: 'Admin@123',
    displayName: 'School Admin (canary demo)',
    actorScope: 'tenant',
    roleKey: ROLE_SCHOOL_ADMIN_KEY,
  },
  {
    slug: 'canary-teacher-1',
    schoolSlug: CANARY_SCHOOL_SLUG,
    email: 'teacher1@canary.local',
    password: 'Teacher@123',
    displayName: 'Teacher One (canary demo)',
    actorScope: 'tenant',
    roleKey: ROLE_TEACHER_KEY,
  },
  {
    slug: 'canary-parent-1',
    schoolSlug: CANARY_SCHOOL_SLUG,
    email: 'parent1@canary.local',
    password: 'Parent@123',
    displayName: 'Parent One (canary demo)',
    actorScope: 'tenant',
    roleKey: ROLE_PARENT_KEY,
  },
  {
    slug: 'canary-student-20260001',
    schoolSlug: CANARY_SCHOOL_SLUG,
    // Synthetic email — User.email is required + unique within school.
    // The admission number is the documented login identifier; until
    // W1.5 wires the `identifierType=admission_no` lookup, the email
    // form below is what `POST /v1/auth/login` accepts.
    email: '20260001@students.canary.local',
    password: 'Student@123',
    displayName: 'Student 20260001 (canary demo)',
    actorScope: 'tenant',
    roleKey: ROLE_STUDENT_KEY,
    admissionNo: '20260001',
  },
];

function applyPepper(password: string): string {
  const pepper = process.env.AUTH_PASSWORD_PEPPER ?? '';
  return pepper.length === 0 ? password : `${password}${pepper}`;
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(applyPepper(password), {
    type: ARGON2_PARAMS.type,
    memoryCost: ARGON2_PARAMS.memoryCost,
    timeCost: ARGON2_PARAMS.timeCost,
    parallelism: ARGON2_PARAMS.parallelism,
  });
}

async function ensurePlatformSchool(prisma: PrismaClient): Promise<string> {
  // Global users need a `schoolId` because `users.school_id` is part of
  // the composite PK and cannot be null. This row exists for that reason
  // alone — it is not a real school.
  const school = await prisma.school.upsert({
    where: { slug: PLATFORM_SCHOOL_SLUG },
    update: {},
    create: {
      slug: PLATFORM_SCHOOL_SLUG,
      legalName: 'Platform (system tenant)',
      displayName: 'Platform',
      countryCode: 'IN',
      city: 'N/A',
      stateCode: 'KA',
      pincode: '000000',
      timezone: 'UTC',
      localeDefault: 'en-IN',
      status: 'active',
      onboardedAt: new Date(),
    },
  });
  return school.id;
}

async function findSchoolIdBySlug(prisma: PrismaClient, slug: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { slug }, select: { id: true } });
  if (school === null) {
    throw new Error(
      `demo-users: school with slug="${slug}" not found. Run the canary-tenant seed first.`,
    );
  }
  return school.id;
}

interface RoleDefaults {
  readonly name: string;
  readonly description: string;
  readonly scope: 'tenant' | 'global';
  /**
   * All five roles are owned by the runtime `BuiltInRolesSeeder`
   * (`backend/src/core/rbac/built-in-roles.seeder.ts`). The Prisma seed
   * creates the rows so the demo `UserRole` FK can resolve before Nest
   * boots, then the runtime seeder rewrites name/description and replaces
   * the permission grant set from `BUILT_IN_ROLE_DEFINITIONS` on boot.
   * `isSystem` is therefore `true` across the board — these rows are
   * platform-managed, not tenant-authored.
   */
  readonly isSystem: boolean;
}

const ROLE_DEFAULTS: Record<SeedRoleKey, RoleDefaults> = {
  [ROLE_PLATFORM_ADMIN_KEY]: {
    name: 'Platform Admin',
    description: 'Cross-tenant super admin. Permission set installed on app boot.',
    scope: 'global',
    isSystem: true,
  },
  [ROLE_SCHOOL_ADMIN_KEY]: {
    name: 'School Admin',
    description: 'Tenant super admin. Permission set installed on app boot.',
    scope: 'tenant',
    isSystem: true,
  },
  [ROLE_TEACHER_KEY]: {
    name: 'Teacher',
    description: 'Subject/class teacher. Permission set installed on app boot.',
    scope: 'tenant',
    isSystem: true,
  },
  [ROLE_PARENT_KEY]: {
    name: 'Parent',
    description: 'Parent of one or more students. Permission set installed on app boot.',
    scope: 'tenant',
    isSystem: true,
  },
  [ROLE_STUDENT_KEY]: {
    name: 'Student',
    description: 'Student. Permission set installed on app boot.',
    scope: 'tenant',
    isSystem: true,
  },
};

async function ensureRole(prisma: PrismaClient, key: SeedRoleKey): Promise<string> {
  // The runtime `BuiltInRolesSeeder` (`backend/src/core/rbac/built-in-roles.seeder.ts`)
  // is the source of truth for every built-in role, including the demo
  // teacher/parent/student set. It only runs at Nest boot, but the
  // Prisma seed must create demo `UserRole` assignments before that, so
  // we upsert the role rows here too — keyed on `role.key` (unique).
  // Role *permissions* are NOT written here: the runtime seeder rewrites
  // them from `BUILT_IN_ROLE_DEFINITIONS` on boot, so any grant we wrote
  // here would be overwritten anyway.
  const defaults = ROLE_DEFAULTS[key];
  const existing = await prisma.role.findUnique({ where: { key }, select: { id: true } });
  if (existing !== null) {
    // Normalise the flag/name/description in case a prior seed wrote
    // `isSystem: false` (pre-RBAC-alignment) or the copy drifted.
    await prisma.role.update({
      where: { id: existing.id },
      data: {
        name: defaults.name,
        description: defaults.description,
        scope: defaults.scope,
        isSystem: defaults.isSystem,
      },
    });
    return existing.id;
  }
  const created = await prisma.role.create({
    data: {
      key,
      name: defaults.name,
      description: defaults.description,
      scope: defaults.scope,
      isSystem: defaults.isSystem,
    },
    select: { id: true },
  });
  return created.id;
}

export async function applyDemoUsers(prisma: PrismaClient): Promise<void> {
  const platformSchoolId = await ensurePlatformSchool(prisma);
  const canarySchoolId = await findSchoolIdBySlug(prisma, CANARY_SCHOOL_SLUG);

  const roleIdByKey: Record<SeedRoleKey, string> = {
    [ROLE_PLATFORM_ADMIN_KEY]: await ensureRole(prisma, ROLE_PLATFORM_ADMIN_KEY),
    [ROLE_SCHOOL_ADMIN_KEY]: await ensureRole(prisma, ROLE_SCHOOL_ADMIN_KEY),
    [ROLE_TEACHER_KEY]: await ensureRole(prisma, ROLE_TEACHER_KEY),
    [ROLE_PARENT_KEY]: await ensureRole(prisma, ROLE_PARENT_KEY),
    [ROLE_STUDENT_KEY]: await ensureRole(prisma, ROLE_STUDENT_KEY),
  };

  for (const demo of DEMO_USERS) {
    const schoolId =
      demo.schoolSlug === PLATFORM_SCHOOL_SLUG ? platformSchoolId : canarySchoolId;
    const roleId = roleIdByKey[demo.roleKey];

    const user = await prisma.user.upsert({
      where: { schoolId_email: { schoolId, email: demo.email } },
      update: {
        displayName: demo.displayName,
        actorScope: demo.actorScope,
        status: 'active',
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        schoolId,
        email: demo.email,
        displayName: demo.displayName,
        actorScope: demo.actorScope,
        status: 'active',
        mustChangePassword: false,
      },
      select: { id: true, schoolId: true },
    });

    const passwordHash = await hashPassword(demo.password);
    await prisma.userPassword.upsert({
      where: { schoolId_userId: { schoolId: user.schoolId, userId: user.id } },
      update: {
        passwordHash,
        algorithm: 'argon2id',
        paramsJson: ARGON2_PARAMS_JSON,
        pepperVersion: 1,
      },
      create: {
        schoolId: user.schoolId,
        userId: user.id,
        passwordHash,
        algorithm: 'argon2id',
        paramsJson: ARGON2_PARAMS_JSON,
        pepperVersion: 1,
      },
    });

    const existingAssignment = await prisma.userRole.findUnique({
      where: {
        schoolId_userId_roleId: { schoolId: user.schoolId, userId: user.id, roleId },
      },
      select: { id: true },
    });
    if (existingAssignment === null) {
      await prisma.userRole.create({
        data: { schoolId: user.schoolId, userId: user.id, roleId },
      });
    } else {
      await prisma.userRole.update({
        where: {
          schoolId_id: { schoolId: user.schoolId, id: existingAssignment.id },
        },
        data: { revokedAt: null, expiresAt: null },
      });
    }
  }
}

export async function verifyDemoUsers(prisma: PrismaClient): Promise<void> {
  for (const demo of DEMO_USERS) {
    const schoolId =
      demo.schoolSlug === PLATFORM_SCHOOL_SLUG
        ? (await prisma.school.findUnique({ where: { slug: PLATFORM_SCHOOL_SLUG } }))?.id
        : (await prisma.school.findUnique({ where: { slug: CANARY_SCHOOL_SLUG } }))?.id;
    if (schoolId === undefined) {
      throw new Error(`demo-users verify: school for "${demo.email}" missing.`);
    }
    const user = await prisma.user.findUnique({
      where: { schoolId_email: { schoolId, email: demo.email } },
      select: {
        id: true,
        actorScope: true,
        status: true,
        password: { select: { passwordHash: true } },
        userRoles: { select: { roleId: true, revokedAt: true } },
      },
    });
    if (user === null) {
      throw new Error(`demo-users verify: user "${demo.email}" missing.`);
    }
    if (user.status !== 'active') {
      throw new Error(`demo-users verify: user "${demo.email}" is not active.`);
    }
    if (user.password === null || user.password.passwordHash.length === 0) {
      throw new Error(`demo-users verify: user "${demo.email}" has no password row.`);
    }
    if (user.actorScope !== demo.actorScope) {
      throw new Error(
        `demo-users verify: user "${demo.email}" has actorScope="${user.actorScope}", expected "${demo.actorScope}".`,
      );
    }
    const hasActiveRole = user.userRoles.some((r) => r.revokedAt === null);
    if (!hasActiveRole) {
      throw new Error(`demo-users verify: user "${demo.email}" has no active role assignment.`);
    }
  }
}
