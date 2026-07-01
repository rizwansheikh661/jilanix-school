import { ConfigService } from '../../config';
import { RefreshInvalidError } from '../auth.errors';
import { RefreshTokenService } from './refresh-token.service';
import {
  REFRESH_TOKEN_LENGTH,
  REFRESH_TOKEN_PREFIX,
} from './token.constants';

function makeConfig(refreshTtlSeconds = 3600): ConfigService {
  return {
    jwt: { refreshTtlSeconds },
  } as unknown as ConfigService;
}

describe('RefreshTokenService', () => {
  describe('generate', () => {
    it('produces a well-formed token with the rft_ prefix and stable length', () => {
      const svc = new RefreshTokenService(makeConfig());
      const { token } = svc.generate();
      expect(token.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true);
      expect(token.length).toBe(REFRESH_TOKEN_LENGTH);
    });

    it('returns a 64-char hex hash that matches the token', () => {
      const svc = new RefreshTokenService(makeConfig());
      const { token, tokenHash } = svc.generate();
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).toBe(svc.hash(token));
    });

    it('produces unique tokens on repeated calls', () => {
      const svc = new RefreshTokenService(makeConfig());
      const seen = new Set(Array.from({ length: 50 }, () => svc.generate().token));
      expect(seen.size).toBe(50);
    });

    it('sets expiresAt to now + refreshTtlSeconds', () => {
      const ttl = 7_200;
      const svc = new RefreshTokenService(makeConfig(ttl));
      const before = Date.now();
      const { expiresAt } = svc.generate();
      const drift = expiresAt.getTime() - before - ttl * 1000;
      expect(Math.abs(drift)).toBeLessThan(1_000);
    });
  });

  describe('hash', () => {
    it('throws RefreshInvalidError on a malformed token', () => {
      const svc = new RefreshTokenService(makeConfig());
      expect(() => svc.hash('nope')).toThrow(RefreshInvalidError);
      expect(() => svc.hash('rft_short')).toThrow(RefreshInvalidError);
      expect(() => svc.hash(`xxx_${'a'.repeat(26)}`)).toThrow(RefreshInvalidError);
    });
  });

  describe('isWellFormed', () => {
    it('accepts a freshly minted token', () => {
      const svc = new RefreshTokenService(makeConfig());
      const { token } = svc.generate();
      expect(svc.isWellFormed(token)).toBe(true);
    });

    it('rejects non-strings', () => {
      const svc = new RefreshTokenService(makeConfig());
      expect(svc.isWellFormed(123)).toBe(false);
      expect(svc.isWellFormed(undefined)).toBe(false);
      expect(svc.isWellFormed(null)).toBe(false);
    });
  });
});
