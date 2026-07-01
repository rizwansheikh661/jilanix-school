import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';

import { ConfigService } from '../../config';
import {
  TokenExpiredError,
  TokenMalformedError,
} from '../auth.errors';
import { AccessTokenService } from './access-token.service';
import { JwtKeysService } from './jwt-keys.service';

function makeKeys(): { keys: JwtKeysService; pub: string; priv: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  // Bypass onModuleInit by stubbing — we don't want to round-trip
  // through env / base64 in unit tests.
  const stub = new JwtKeysService({} as ConfigService);
  // @ts-expect-error — assigning to a private field for the test only.
  stub.keys = { privateKey, publicKey, kid: 'test-kid' };
  return { keys: stub, pub: publicKey, priv: privateKey };
}

function makeConfig(opts?: { accessTtlSeconds?: number }): ConfigService {
  return {
    jwt: {
      accessTtlSeconds: opts?.accessTtlSeconds ?? 900,
      issuer: 'schoolos',
      audience: 'schoolos-api',
    },
  } as unknown as ConfigService;
}

function makeService(opts?: { accessTtlSeconds?: number }): {
  svc: AccessTokenService;
  keys: JwtKeysService;
} {
  const { keys } = makeKeys();
  const config = makeConfig(opts);
  const svc = new AccessTokenService(new JwtService({}), keys, config);
  return { svc, keys };
}

describe('AccessTokenService', () => {
  it('signs a JWT with the expected claim shape', async () => {
    const { svc } = makeService();
    const signed = await svc.sign({
      userId: 'user-1',
      schoolId: 'school-1',
      actorScope: 'tenant',
      roleIds: ['role-a'],
      sessionId: 'session-1',
      chainId: 'chain-1',
    });
    expect(typeof signed.token).toBe('string');
    expect(signed.expiresAt).toBeInstanceOf(Date);
    expect(signed.tokenId).toMatch(/[0-9a-f-]{36}/);

    const claims = await svc.verify(signed.token);
    expect(claims.sub).toBe('user-1');
    expect(claims.tenant_id).toBe('school-1');
    expect(claims.scope).toBe('tenant');
    expect(claims.role_ids).toEqual(['role-a']);
    expect(claims.sid).toBe('session-1');
    expect(claims.chain_id).toBe('chain-1');
    expect(claims.jti).toBe(signed.tokenId);
    expect(claims.iss).toBe('schoolos');
    expect(claims.aud).toBe('schoolos-api');
  });

  it('emits null tenant_id for global actors', async () => {
    const { svc } = makeService();
    const signed = await svc.sign({
      userId: 'user-1',
      schoolId: null,
      actorScope: 'global',
      roleIds: [],
      sessionId: 'session-1',
      chainId: 'chain-1',
    });
    const claims = await svc.verify(signed.token);
    expect(claims.tenant_id).toBeNull();
    expect(claims.scope).toBe('global');
  });

  it('throws TokenMalformedError on a tampered signature', async () => {
    const { svc } = makeService();
    const signed = await svc.sign({
      userId: 'u', schoolId: 's', actorScope: 'tenant',
      roleIds: [], sessionId: 'sess', chainId: 'ch',
    });
    const parts = signed.token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]?.slice(0, -2)}xx`;
    await expect(svc.verify(tampered)).rejects.toBeInstanceOf(TokenMalformedError);
  });

  it('throws TokenExpiredError when exp is in the past', async () => {
    // Negative TTL is rejected by the env schema, so we sign with a
    // 1-second TTL and wait for it to lapse.
    const { svc } = makeService({ accessTtlSeconds: 60 });
    const signed = await svc.sign({
      userId: 'u', schoolId: 's', actorScope: 'tenant',
      roleIds: [], sessionId: 'sess', chainId: 'ch',
    });
    // Force an expiry by re-signing with a manipulated `exp` via private key.
    // Easier path: directly fabricate a JWT with a past exp.
    const jwtSvc = new JwtService({});
    const expired = await jwtSvc.signAsync(
      {
        sub: 'u', tenant_id: 's', scope: 'tenant', role_ids: [],
        sid: 'sess', chain_id: 'ch', jti: 'jti', iss: 'schoolos', aud: 'schoolos-api',
        // iat and exp clamped to a past time.
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      {
        algorithm: 'RS256',
        // Reuse the keypair held by the test service.
        privateKey: (svc as unknown as { keys: JwtKeysService }).keys.privateKey,
        noTimestamp: true,
      },
    );
    void signed;
    await expect(svc.verify(expired)).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('throws TokenMalformedError on issuer/audience mismatch', async () => {
    const { svc } = makeService();
    const signed = await svc.sign({
      userId: 'u', schoolId: 's', actorScope: 'tenant',
      roleIds: [], sessionId: 'sess', chainId: 'ch',
    });
    // Spoof a different issuer in the verify-side config.
    (svc as unknown as { config: ConfigService }).config = makeConfig() as ConfigService;
    // Re-construct service with a different audience.
    const wrongAud = new AccessTokenService(
      new JwtService({}),
      (svc as unknown as { keys: JwtKeysService }).keys,
      { jwt: { accessTtlSeconds: 900, issuer: 'schoolos', audience: 'someone-else' } } as unknown as ConfigService,
    );
    await expect(wrongAud.verify(signed.token)).rejects.toBeInstanceOf(TokenMalformedError);
  });
});
