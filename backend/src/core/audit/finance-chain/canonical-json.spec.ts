import { canonicalize } from './canonical-json';

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it('serialises Dates as ISO-8601 UTC', () => {
    const t = new Date('2026-06-17T12:34:56.789Z');
    expect(canonicalize({ at: t })).toBe('{"at":"2026-06-17T12:34:56.789Z"}');
  });

  it('renders undefined as null but skips object undefined values', () => {
    // Top-level undefined → null.
    expect(canonicalize(undefined)).toBe('null');
    // Object-level undefined is dropped (per JSON convention), but null is kept.
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('encodes BigInts with an "n" suffix', () => {
    expect(canonicalize({ big: 12345678901234567890n })).toBe('{"big":"12345678901234567890n"}');
  });

  it('walks nested objects + arrays deterministically', () => {
    const out = canonicalize({
      z: [{ b: 2, a: 1 }, { d: 4, c: 3 }],
      a: { y: 'y', x: 'x' },
    });
    expect(out).toBe('{"a":{"x":"x","y":"y"},"z":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });

  it('throws on circular references', () => {
    const root: Record<string, unknown> = { a: 1 };
    root.self = root;
    expect(() => canonicalize(root)).toThrow(/circular/);
  });

  it('throws on functions and symbols', () => {
    expect(() => canonicalize({ f: () => 1 })).toThrow(/function/);
    expect(() => canonicalize({ s: Symbol('x') })).toThrow(/symbol/);
  });
});
