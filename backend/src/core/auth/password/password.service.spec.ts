import { ConfigService } from '../../config';
import {
  DEFAULT_ARGON2_PARAMS,
  PasswordService,
  type Argon2Params,
} from './password.service';

function makeConfig(passwordPepper?: string): ConfigService {
  return {
    jwt: { passwordPepper },
  } as unknown as ConfigService;
}

// Argon2id is intentionally slow. Bump the per-test budget so the calibrated
// params don't have to be lowered just for CI.
jest.setTimeout(15_000);

describe('PasswordService', () => {
  it('hashes a password with argon2id PHC parameters', async () => {
    const svc = new PasswordService(makeConfig());
    const result = await svc.hash('hunter2-correct-horse');
    expect(result.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(result.algorithm).toBe('argon2id');
    expect(result.params).toEqual(DEFAULT_ARGON2_PARAMS);
    expect(result.pepperVersion).toBe(1);
  });

  it('verifies a matching password', async () => {
    const svc = new PasswordService(makeConfig());
    const { passwordHash } = await svc.hash('correct horse battery staple');
    await expect(svc.verify(passwordHash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const svc = new PasswordService(makeConfig());
    const { passwordHash } = await svc.hash('correct');
    await expect(svc.verify(passwordHash, 'wrong')).resolves.toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    const svc = new PasswordService(makeConfig());
    await expect(svc.verify('not-a-phc', 'whatever')).resolves.toBe(false);
  });

  it('verifies with the pepper applied — peppered hash, peppered verify', async () => {
    const peppered = new PasswordService(makeConfig('s3cr3t-pepper'));
    const { passwordHash } = await peppered.hash('apples');
    await expect(peppered.verify(passwordHash, 'apples')).resolves.toBe(true);
  });

  it('fails to verify peppered hash without the pepper', async () => {
    const peppered = new PasswordService(makeConfig('s3cr3t-pepper'));
    const { passwordHash } = await peppered.hash('apples');
    const noPepper = new PasswordService(makeConfig(undefined));
    await expect(noPepper.verify(passwordHash, 'apples')).resolves.toBe(false);
  });

  describe('needsRehash', () => {
    it('returns false when stored params match current calibration', () => {
      const svc = new PasswordService(makeConfig());
      expect(
        svc.needsRehash({ params: DEFAULT_ARGON2_PARAMS, pepperVersion: 1 }),
      ).toBe(false);
    });

    it('returns true when stored memoryCost lags current', () => {
      const svc = new PasswordService(makeConfig());
      const stale: Argon2Params = { ...DEFAULT_ARGON2_PARAMS, memoryCost: 1_024 };
      expect(svc.needsRehash({ params: stale, pepperVersion: 1 })).toBe(true);
    });

    it('returns true when pepperVersion has moved on', () => {
      const svc = new PasswordService(makeConfig());
      expect(
        svc.needsRehash({ params: DEFAULT_ARGON2_PARAMS, pepperVersion: 99 }),
      ).toBe(true);
    });
  });
});
