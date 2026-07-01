/* eslint-disable no-console */
const BASE = 'http://127.0.0.1:3000/api/v1';
const CANARY = '36c2e579-83f9-42c8-958a-ab00e58e5b1e';
const PLATFORM = '8ebaba31-773d-4847-8250-e3c555bdf087';

const PERSONAS = [
  { label: 'platform_admin', schoolId: PLATFORM, email: 'platform.admin@schoolos.local', password: 'Admin@123' },
  { label: 'school_admin',  schoolId: CANARY,   email: 'school.admin@canary.local',     password: 'Admin@123' },
  { label: 'teacher',       schoolId: CANARY,   email: 'teacher1@canary.local',         password: 'Teacher@123' },
  { label: 'parent',        schoolId: CANARY,   email: 'parent1@canary.local',          password: 'Parent@123' },
  { label: 'student',       schoolId: CANARY,   email: '20260001@students.canary.local', password: 'Student@123' },
];

function decodeJwt(jwt) {
  const [, payload] = jwt.split('.');
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function json(method, path, body, headers = {}) {
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

(async () => {
  const out = { personas: {}, edges: {} };

  for (const p of PERSONAS) {
    const r = await json('POST', '/auth/login', { schoolId: p.schoolId, email: p.email, password: p.password });
    const tokens = r.body?.data;
    if (!tokens) {
      out.personas[p.label] = { loginStatus: r.status, error: r.body };
      continue;
    }
    const claims = decodeJwt(tokens.accessToken);
    out.personas[p.label] = {
      loginStatus: r.status,
      tokenTopLevelKeys: Object.keys(tokens).sort(),
      user: tokens.user,
      jwtClaims: {
        sub: claims.sub,
        tenant_id: claims.tenant_id,
        scope: claims.scope,
        role_ids_count: claims.role_ids?.length,
        sid: typeof claims.sid === 'string',
        chain_id: typeof claims.chain_id === 'string',
        jti: typeof claims.jti === 'string',
        iat: claims.iat,
        exp: claims.exp,
        iss: claims.iss,
        aud: claims.aud,
        ttlSeconds: claims.exp - claims.iat,
      },
      refreshExpiresIn:
        Math.round((new Date(tokens.refreshTokenExpiresAt).getTime() - Date.now()) / 1000),
      accessExpiresIn:
        Math.round((new Date(tokens.accessTokenExpiresAt).getTime() - Date.now()) / 1000),
    };
  }

  // /auth/me with the school_admin token
  const sa = PERSONAS.find(x => x.label === 'school_admin');
  const saLogin = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password });
  const saTok = saLogin.body.data.accessToken;
  const me = await json('GET', '/auth/me', undefined, { Authorization: `Bearer ${saTok}` });
  out.edges.meSchoolAdmin = { status: me.status, body: me.body };

  // Remember Me TTL — fresh login with rememberMe:true
  const rmTrue = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password, rememberMe: true });
  const rmFalse = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password, rememberMe: false });
  out.edges.rememberMe = {
    rememberTrueRefreshSecs:
      Math.round((new Date(rmTrue.body.data.refreshTokenExpiresAt).getTime() - Date.now()) / 1000),
    rememberFalseRefreshSecs:
      Math.round((new Date(rmFalse.body.data.refreshTokenExpiresAt).getTime() - Date.now()) / 1000),
  };

  // tenantSlug login path
  const slugLogin = await json('POST', '/auth/login', {
    tenantSlug: 'canary', identifier: 'school.admin@canary.local', identifierType: 'email', password: 'Admin@123',
  });
  out.edges.tenantSlugLogin = { status: slugLogin.status, hasTokens: !!slugLogin.body?.data?.accessToken };

  // admission_no identifierType (spec-allowed but service rejects in V1)
  const adm = await json('POST', '/auth/login', {
    tenantSlug: 'canary', identifier: '20260001', identifierType: 'admission_no', password: 'Student@123',
  });
  out.edges.admissionNoLogin = { status: adm.status, body: adm.body };

  // Invalid credentials envelope
  const bad = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: 'wrong-password!!' });
  out.edges.invalidCreds = { status: bad.status, body: bad.body };

  // Validation envelope — bad UUID
  const valErr = await json('POST', '/auth/login', { schoolId: 'not-a-uuid', email: 'x@y.z', password: 'shortpw1' });
  out.edges.validationErr = { status: valErr.status, body: valErr.body };

  // Refresh path
  const refLogin = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password });
  const refTok = refLogin.body.data.refreshToken;
  const refRes = await json('POST', '/auth/refresh', { refreshToken: refTok });
  out.edges.refreshOk = {
    status: refRes.status,
    keys: Object.keys(refRes.body?.data ?? {}).sort(),
    userPresent: refRes.body?.data?.user !== undefined,
    mustChangePassword: refRes.body?.data?.mustChangePassword,
  };
  // Reuse same refresh token → should detect reuse + revoke chain
  const reuse = await json('POST', '/auth/refresh', { refreshToken: refTok });
  out.edges.refreshReuse = { status: reuse.status, body: reuse.body };

  // Invalid refresh
  const badRef = await json('POST', '/auth/refresh', { refreshToken: 'rft_thisisdefinitelyinvalid_xxxxx' });
  out.edges.refreshInvalid = { status: badRef.status, body: badRef.body };

  // Logout
  const loLogin = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password });
  const loTok = loLogin.body.data.accessToken;
  const lo = await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${loTok}` } });
  out.edges.logout = { status: lo.status, bodyEmpty: (await lo.text()).length === 0 };

  // Logout-all
  const loaLogin = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password });
  const loaTok = loaLogin.body.data.accessToken;
  const loa = await fetch(`${BASE}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${loaTok}` } });
  const loaText = await loa.text();
  out.edges.logoutAll = { status: loa.status, body: loaText.length === 0 ? null : JSON.parse(loaText) };

  // logout-all as platform admin (R-12 — documented limitation)
  const pa = PERSONAS.find(x => x.label === 'platform_admin');
  const paLogin = await json('POST', '/auth/login', { schoolId: pa.schoolId, email: pa.email, password: pa.password });
  const paTok = paLogin.body.data.accessToken;
  const paLoa = await fetch(`${BASE}/auth/logout-all`, { method: 'POST', headers: { Authorization: `Bearer ${paTok}` } });
  out.edges.logoutAllPlatform = { status: paLoa.status, body: await paLoa.text() };

  // Auth without bearer
  const noAuth = await json('GET', '/auth/me');
  out.edges.meNoAuth = { status: noAuth.status, body: noAuth.body };

  // password-reset/request — accepted always
  const prReq = await json('POST', '/auth/password-reset/request', { schoolId: sa.schoolId, email: 'nobody@nowhere.test' });
  out.edges.passwordResetRequest = { status: prReq.status, body: prReq.body };

  // password-reset/confirm — bad token
  const prConf = await json('POST', '/auth/password-reset/confirm', { token: 'a'.repeat(32), newPassword: 'NewPass@123' });
  out.edges.passwordResetConfirmBad = { status: prConf.status, body: prConf.body };

  // first-login/change-password — wrong current pw
  const flcLogin = await json('POST', '/auth/login', { schoolId: sa.schoolId, email: sa.email, password: sa.password });
  const flcTok = flcLogin.body.data.accessToken;
  const flc = await json('POST', '/auth/first-login/change-password',
    { currentPassword: 'wrong-current', newPassword: 'BrandNew@456' },
    { Authorization: `Bearer ${flcTok}` });
  out.edges.firstLoginChange = { status: flc.status, body: flc.body };

  // Verify /v1/auth/password/change does NOT exist
  const pwChange = await json('POST', '/auth/password/change', { currentPassword: 'x', newPassword: 'y' }, { Authorization: `Bearer ${flcTok}` });
  out.edges.passwordChangeNotFound = { status: pwChange.status, body: pwChange.body };

  console.log(JSON.stringify(out, null, 2));
})();
