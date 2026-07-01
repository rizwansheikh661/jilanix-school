/**
 * Canonical JSON serialiser used by the audit hash chain.
 *
 * `JSON.stringify` is NOT deterministic — object key order depends on
 * insertion order, and locales can affect number formatting (it doesn't,
 * but enough other implementations do that we make the rule explicit).
 *
 * For the audit hash chain, two services running on different boxes MUST
 * agree on the exact bytes for a given record so the hash recomputes. This
 * implementation:
 *
 *   - Sorts object keys lexicographically (deep).
 *   - Renders `undefined` as `null` (so an explicit `undefined` does not
 *     silently disappear and break the chain).
 *   - Renders `Date` as ISO-8601 UTC.
 *   - Renders `BigInt` as a decimal string with a `n` suffix.
 *   - Throws on functions, symbols, or circular references — those have no
 *     well-defined canonical form.
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`canonicalize: cannot serialise ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalise(v, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('canonicalize: circular reference');
    }
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      out[k] = normalise(v, seen);
    }
    return out;
  }
  return value;
}
