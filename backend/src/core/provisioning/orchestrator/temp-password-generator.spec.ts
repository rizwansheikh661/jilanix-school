/**
 * Unit spec for `generateTempPassword` — covers length, char-class invariants,
 * and basic uniqueness.
 */
import {
  TEMP_PASSWORD_LENGTH,
  generateTempPassword,
} from './temp-password-generator';

describe('generateTempPassword', () => {
  it('returns a password of TEMP_PASSWORD_LENGTH characters', () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
  });

  it('contains at least one of each character class', () => {
    for (let i = 0; i < 50; i += 1) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/[A-HJ-NP-Z]/); // uppercase (sans I,O)
      expect(pw).toMatch(/[a-km-z]/); // lowercase (sans l)
      expect(pw).toMatch(/[2-9]/); // digits (sans 0,1)
      expect(pw).toMatch(/[!@#$%^&*]/); // symbols
    }
  });

  it('produces no visually confusing characters (I, O, l, 0, 1)', () => {
    for (let i = 0; i < 50; i += 1) {
      const pw = generateTempPassword();
      expect(pw).not.toMatch(/[IOl01]/);
    }
  });

  it('produces unique passwords across runs (entropy sanity check)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      set.add(generateTempPassword());
    }
    expect(set.size).toBeGreaterThan(95);
  });
});
