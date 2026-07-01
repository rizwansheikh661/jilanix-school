import {
  extractTraceId,
  generateRequestId,
  isUlid,
  normaliseRequestId,
} from './correlation';

describe('correlation', () => {
  describe('generateRequestId', () => {
    it('returns a 26-char ULID', () => {
      const id = generateRequestId();
      expect(id).toHaveLength(26);
      expect(isUlid(id)).toBe(true);
    });
  });

  describe('normaliseRequestId', () => {
    it('returns the input when it is a valid id', () => {
      const id = generateRequestId();
      expect(normaliseRequestId(id)).toBe(id);
    });

    it('accepts UUIDs from upstream gateways', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(normaliseRequestId(uuid)).toBe(uuid);
    });

    it('generates a fresh id when input is missing', () => {
      expect(isUlid(normaliseRequestId(undefined))).toBe(true);
      expect(isUlid(normaliseRequestId(null))).toBe(true);
      expect(isUlid(normaliseRequestId(''))).toBe(true);
    });

    it('generates a fresh id when input is too short or too long', () => {
      expect(isUlid(normaliseRequestId('x'))).toBe(true);
      expect(isUlid(normaliseRequestId('y'.repeat(200)))).toBe(true);
    });

    it('rejects whitespace or control characters', () => {
      expect(isUlid(normaliseRequestId('abc\ndef\nghi'))).toBe(true);
      expect(isUlid(normaliseRequestId('bad\tid\there!!'))).toBe(true);
    });
  });

  describe('extractTraceId', () => {
    it('returns the trace-id from a well-formed traceparent', () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      expect(extractTraceId(tp)).toBe('0af7651916cd43dd8448eb211c80319c');
    });

    it('returns undefined for the wrong version', () => {
      const tp = '01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      expect(extractTraceId(tp)).toBeUndefined();
    });

    it('returns undefined for non-hex trace ids', () => {
      const tp = '00-not-hex-not-hex-not-hex-not-hex-zzz-b7ad6b7169203331-01';
      expect(extractTraceId(tp)).toBeUndefined();
    });

    it('returns undefined for non-string input', () => {
      expect(extractTraceId(undefined)).toBeUndefined();
      expect(extractTraceId(['x'])).toBeUndefined();
    });
  });
});
