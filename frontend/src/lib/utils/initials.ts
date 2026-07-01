/**
 * Derive up to two-letter initials from a person's name.
 * Examples:
 *   "Priya Verma" -> "PV"
 *   "Aarav"       -> "AA"
 *   "Mrs. Riya Patel" -> "RP" (titles stripped)
 *   ""            -> "?"
 */
const TITLE_PREFIXES = new Set(['mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'rev', 'sir', 'madam']);

export function initialsOf(input: string | undefined | null): string {
  if (!input) return '?';
  const cleaned = input.trim();
  if (!cleaned) return '?';

  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 0)
    .filter((t) => !TITLE_PREFIXES.has(t.toLowerCase().replace(/\.$/, '')));

  if (tokens.length === 0) return '?';

  if (tokens.length === 1) {
    const t = tokens[0]!;
    return (t.length >= 2 ? t.slice(0, 2) : t).toUpperCase();
  }

  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Deterministic 8-color hash for avatar background.
 * Returns an index 0..7 to map into the muted avatar palette.
 */
const AVATAR_PALETTE_SIZE = 8;
export function avatarPaletteIndex(seed: string | undefined | null): number {
  if (!seed) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % AVATAR_PALETTE_SIZE;
}
