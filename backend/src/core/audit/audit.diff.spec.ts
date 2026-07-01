import { capPayload, diffRows, redactSensitive } from './audit.diff';

describe('audit.diff', () => {
  describe('diffRows', () => {
    it('keeps only changed keys', () => {
      const out = diffRows(
        { id: 'a', name: 'X', age: 10 },
        { id: 'a', name: 'Y', age: 10 },
      );
      expect(out.before).toEqual({ name: 'X' });
      expect(out.after).toEqual({ name: 'Y' });
    });

    it('records added keys with before=null', () => {
      const out = diffRows({ id: 'a' }, { id: 'a', extra: 'new' });
      expect(out.before).toEqual({ extra: null });
      expect(out.after).toEqual({ extra: 'new' });
    });

    it('records removed keys with after=null', () => {
      const out = diffRows({ id: 'a', gone: 'val' }, { id: 'a' });
      expect(out.before).toEqual({ gone: 'val' });
      expect(out.after).toEqual({ gone: null });
    });

    it('treats Date instances by epoch equality', () => {
      const t = new Date('2026-06-17T00:00:00Z');
      const out = diffRows({ at: t }, { at: new Date(t.getTime()) });
      expect(out.before).toEqual({});
      expect(out.after).toEqual({});
    });

    it('treats non-objects as empty (no diff entries)', () => {
      const out = diffRows('a', 'b');
      expect(out.before).toEqual({});
      expect(out.after).toEqual({});
    });
  });

  describe('redactSensitive', () => {
    it('replaces base-set keys with [REDACTED]', () => {
      const out = redactSensitive({
        name: 'Alice',
        password: 'hunter2',
        token: 'xyz',
        nested: { mfaSecret: 's', otp: '123' },
      });
      expect(out).toEqual({
        name: 'Alice',
        password: '[REDACTED]',
        token: '[REDACTED]',
        nested: { mfaSecret: '[REDACTED]', otp: '[REDACTED]' },
      });
    });

    it('honours per-call extras', () => {
      const out = redactSensitive({ recoveryCode: 'r', name: 'A' }, ['recoveryCode']);
      expect(out).toEqual({ recoveryCode: '[REDACTED]', name: 'A' });
    });

    it('walks into arrays', () => {
      const out = redactSensitive([
        { id: 1, password: 'p' },
        { id: 2, password: 'q' },
      ]);
      expect(out).toEqual([
        { id: 1, password: '[REDACTED]' },
        { id: 2, password: '[REDACTED]' },
      ]);
    });

    it('does not mutate the input', () => {
      const input = { password: 'p' };
      redactSensitive(input);
      expect(input.password).toBe('p');
    });
  });

  describe('capPayload', () => {
    it('returns the value as-is when under the limit', () => {
      const r = capPayload({ small: true });
      expect(r.overflow).toBe(false);
      expect(r.value).toEqual({ small: true });
    });

    it('emits an overflow placeholder when over 64 KiB', () => {
      const big = { blob: 'x'.repeat(70 * 1024) };
      const r = capPayload(big);
      expect(r.overflow).toBe(true);
      expect(r.value).toMatchObject({
        __schoolos_audit_overflow__: true,
        originalBytes: expect.any(Number),
      });
    });
  });
});
