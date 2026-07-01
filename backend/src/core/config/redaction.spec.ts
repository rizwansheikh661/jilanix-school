import { isSensitiveKey, maskValue } from './redaction';

describe('redaction', () => {
  describe('isSensitiveKey', () => {
    it('flags explicit sensitive keys', () => {
      expect(isSensitiveKey('jwt.privateKeyBase64')).toBe(true);
      expect(isSensitiveKey('AUTH_PASSWORD_PEPPER')).toBe(true);
    });

    it('flags suffix-based sensitive keys', () => {
      expect(isSensitiveKey('SOMETHING_SECRET')).toBe(true);
      expect(isSensitiveKey('FOO_KEY')).toBe(true);
      expect(isSensitiveKey('BAR_TOKEN')).toBe(true);
      expect(isSensitiveKey('USER_PASSWORD')).toBe(true);
      expect(isSensitiveKey('SENTRY_DSN')).toBe(true);
    });

    it('does not flag innocuous keys', () => {
      expect(isSensitiveKey('app.name')).toBe(false);
      expect(isSensitiveKey('LOG_LEVEL')).toBe(false);
      expect(isSensitiveKey('APP_PORT')).toBe(false);
    });
  });

  describe('maskValue', () => {
    it('masks short values entirely', () => {
      expect(maskValue('abc')).not.toContain('abc');
    });

    it('reveals only the last 4 characters of long values', () => {
      const masked = maskValue('superlongsecretvalue1234');
      expect(masked).toContain('1234');
      expect(masked).not.toContain('superlong');
    });

    it('handles undefined and empty', () => {
      expect(maskValue(undefined)).toBe('<unset>');
      expect(maskValue('')).toBe('<empty>');
    });
  });
});
