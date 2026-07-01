/* eslint-disable no-console */
// Runtime verification — every auth endpoint must work without body schoolId.
// Tenant is supplied via X-Tenant-Slug header only (mirrors what the FE does).
const BASE = 'http://127.0.0.1:3000/api/v1';

const PERSONAS = [
  { label: 'platform_admin', slug: 'platform', email: 'platform.admin@schoolos.local', password: 'Admin@123' },
  { label: 'school_admin',   slug: 'canary',   email: 'school.admin@canary.local',     password: 'Admin@123' },
  { label: 'teacher',        slug: 'canary',   email: 'teacher1@canary.local',         password: 'Teacher@123' },
  { label: 'parent',         slug: 'canary',   email: 'parent1@canary.local',          password: 'Parent@123' },
  { label: 'student',        slug: 'canary',   email: '20260001@students.canary.local', password: 'Student@123' },
];

function decodeJwt(jwt) {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text.length === 0 ? null : JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

function tenantHeaders(slug) {
  return slug ? { 'X-Tenant-Slug': slug } : {};
}

(async () => {
  const out = { personas: {}, edges: {} };

  for (const p of PERSONAS) {
    const r = await call('POST', '/auth/login',
      { email: p.email, password: p.password, rememberMe: false },
      tenantHeaders(p.slug),
    );
    const tokens = r.body?.data;
    if (!tokens?.accessToken) {
      out.personas[p.label] = { loginStatus: r.status, error: r.body };
      continue;
    }
    const claims = decodeJwt(tokens.accessToken);
    const access = tokens.accessToken;

    // /auth/me
    const me = await call('GET', '/auth/me', undefined,
      { Authorization: `Bearer ${access}`, ...tenantHeaders(p.slug) });

    // /auth/refresh
    const refreshed = await call('POST', '/auth/refresh',
      { refreshToken: tokens.refreshToken },
      tenantHeaders(p.slug));

    // /auth/logout — use a fresh login so we don't disturb the refresh chain
    const freshLogin = await call('POST', '/auth/login',
      { email: p.email, password: p.password, rememberMe: false },
      tenantHeaders(p.slug));
    const lo = await call('POST', '/auth/logout', {},
      { Authorization: `Bearer ${freshLogin.body.data.accessToken}`, ...tenantHeaders(p.slug) });

    out.personas[p.label] = {
      loginStatus: r.status,
      jwtScope: claims.scope,
      jwtTenantId: claims.tenant_id,
      jwtRoleCount: claims.role_ids?.length ?? 0,
      mustChangePassword: tokens.mustChangePassword,
      meStatus: me.status,
      meActorScope: me.body?.data?.actorScope,
      refreshStatus: refreshed.status,
      refreshHasNewTokens: !!refreshed.body?.data?.accessToken,
      logoutStatus: lo.status,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // /auth/password-reset/request — no body schoolId, tenant via header.
  const prCanary = await call('POST', '/auth/password-reset/request',
    { email: 'school.admin@canary.local' },
    tenantHeaders('canary'));
  out.edges.passwordResetRequestCanary = { status: prCanary.status, body: prCanary.body };

  const prPlatform = await call('POST', '/auth/password-reset/request',
    { email: 'platform.admin@schoolos.local' },
    tenantHeaders('platform'));
  out.edges.passwordResetRequestPlatform = { status: prPlatform.status, body: prPlatform.body };

  const prUnknown = await call('POST', '/auth/password-reset/request',
    { email: 'no-such-user@canary.local' },
    tenantHeaders('canary'));
  out.edges.passwordResetRequestUnknown = { status: prUnknown.status, body: prUnknown.body };

  // No tenant header at all — should still return accepted:true (anti-enumeration silent no-op)
  const prNoHeader = await call('POST', '/auth/password-reset/request',
    { email: 'school.admin@canary.local' });
  out.edges.passwordResetRequestNoHeader = { status: prNoHeader.status, body: prNoHeader.body };

  // /auth/password-reset/confirm — bad token, tenant unnecessary (token-derived)
  const prConfBad = await call('POST', '/auth/password-reset/confirm',
    { token: 'a'.repeat(32), newPassword: 'NewPass@123' });
  out.edges.passwordResetConfirmBad = { status: prConfBad.status, body: prConfBad.body };

  // /auth/first-login/change-password — needs auth, tenant comes from JWT
  const saLogin = await call('POST', '/auth/login',
    { email: 'school.admin@canary.local', password: 'Admin@123' },
    tenantHeaders('canary'));
  const flc = await call('POST', '/auth/first-login/change-password',
    { currentPassword: 'wrong-pw', newPassword: 'BrandNew@456' },
    { Authorization: `Bearer ${saLogin.body.data.accessToken}`, ...tenantHeaders('canary') });
  out.edges.firstLoginChangeWrongPw = { status: flc.status, body: flc.body };

  // /auth/logout-all
  const loaLogin = await call('POST', '/auth/login',
    { email: 'school.admin@canary.local', password: 'Admin@123' },
    tenantHeaders('canary'));
  const loa = await call('POST', '/auth/logout-all', {},
    { Authorization: `Bearer ${loaLogin.body.data.accessToken}`, ...tenantHeaders('canary') });
  out.edges.logoutAll = { status: loa.status, body: loa.body };

  // verify /auth/change-password does not exist
  const changePw = await call('POST', '/auth/change-password', { x: 1 });
  out.edges.changePasswordNotFound = { status: changePw.status };

  // /auth/me without bearer
  const meNo = await call('GET', '/auth/me');
  out.edges.meNoAuth = { status: meNo.status };

  console.log(JSON.stringify(out, null, 2));
})();
