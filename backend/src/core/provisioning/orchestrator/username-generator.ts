/**
 * generateAdminUsername — derives the default super-admin email for a
 * freshly-provisioned tenant.
 *
 * Format: `admin@{slug}.local` for the first attempt, then `+2`, `+3`, ...
 * on subsequent collisions. Local-part collisions are rare (slug is unique
 * across the platform), but they happen when a slug gets reclaimed after a
 * cancellation; the suffix keeps the bootstrap path idempotent.
 */
export interface UsernameProbe {
  (candidate: string): Promise<boolean>;
}

const MAX_USERNAME_ATTEMPTS = 25;

export async function generateAdminUsername(
  slug: string,
  isTaken: UsernameProbe,
): Promise<string> {
  const sanitized = sanitizeSlugForLocalPart(slug);
  if (sanitized.length === 0) {
    throw new Error('generateAdminUsername: slug produces an empty local-part.');
  }
  const baseHost = `${sanitized}.local`;
  for (let attempt = 1; attempt <= MAX_USERNAME_ATTEMPTS; attempt += 1) {
    const local = attempt === 1 ? 'admin' : `admin+${attempt.toString()}`;
    const candidate = `${local}@${baseHost}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(
    `generateAdminUsername: exhausted ${MAX_USERNAME_ATTEMPTS.toString()} attempts for slug=${slug}.`,
  );
}

function sanitizeSlugForLocalPart(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
