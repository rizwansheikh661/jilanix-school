/**
 * Unit spec for `generateAdminUsername` — covers happy-path, collision
 * suffixing, slug sanitisation, and the attempt cap.
 */
import { generateAdminUsername } from './username-generator';

describe('generateAdminUsername', () => {
  it('returns admin@{slug}.local on the first attempt when free', async () => {
    const probe = jest.fn().mockResolvedValue(false);
    const result = await generateAdminUsername('sunrise', probe);
    expect(result).toBe('admin@sunrise.local');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('falls back to admin+2 on first collision', async () => {
    const probe = jest.fn().mockImplementation(async (candidate: string) => {
      return candidate === 'admin@sunrise.local';
    });
    const result = await generateAdminUsername('sunrise', probe);
    expect(result).toBe('admin+2@sunrise.local');
  });

  it('walks +3, +4 ... until it finds a free slot', async () => {
    const taken = new Set([
      'admin@sunrise.local',
      'admin+2@sunrise.local',
      'admin+3@sunrise.local',
    ]);
    const probe = jest.fn().mockImplementation(async (candidate: string) =>
      taken.has(candidate),
    );
    const result = await generateAdminUsername('sunrise', probe);
    expect(result).toBe('admin+4@sunrise.local');
  });

  it('lowercases + dash-sanitises the slug', async () => {
    const probe = jest.fn().mockResolvedValue(false);
    const result = await generateAdminUsername('SunRise-2026!', probe);
    expect(result).toBe('admin@sunrise-2026.local');
  });

  it('throws on an empty slug', async () => {
    const probe = jest.fn().mockResolvedValue(false);
    await expect(generateAdminUsername('!!!', probe)).rejects.toThrow(
      /empty local-part/,
    );
  });

  it('gives up after MAX_USERNAME_ATTEMPTS collisions', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    await expect(generateAdminUsername('sunrise', probe)).rejects.toThrow(
      /exhausted/,
    );
  });
});
