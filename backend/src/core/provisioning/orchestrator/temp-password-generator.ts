/**
 * generateTempPassword — produces a 16-character cryptographically random
 * password that contains at least one character from each of four classes:
 * uppercase, lowercase, digit, and a small symbol set.
 *
 * Generation strategy:
 *   1. Pick one mandatory character from each class.
 *   2. Fill the remaining 12 slots from the union of all classes.
 *   3. Shuffle (Fisher–Yates with `crypto.randomInt`) so the mandatory
 *      characters don't always cluster at the start.
 *
 * Output is intended for one-time emailing; callers must immediately set
 * `users.must_change_password = true` so the user is forced to rotate on
 * first login.
 */
import { randomInt } from 'node:crypto';

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O — visual confusion
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'; // no l — visual confusion
const DIGITS = '23456789'; // no 0, 1 — visual confusion
const SYMBOLS = '!@#$%^&*';

const ALL = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

export const TEMP_PASSWORD_LENGTH = 16;

export function generateTempPassword(): string {
  if (TEMP_PASSWORD_LENGTH < 4) {
    throw new Error('TEMP_PASSWORD_LENGTH must be at least 4 to satisfy class invariants.');
  }
  const chars: string[] = [
    pickOne(UPPERCASE),
    pickOne(LOWERCASE),
    pickOne(DIGITS),
    pickOne(SYMBOLS),
  ];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(pickOne(ALL));
  }
  shuffleInPlace(chars);
  return chars.join('');
}

function pickOne(pool: string): string {
  const idx = randomInt(0, pool.length);
  const ch = pool[idx];
  if (ch === undefined) {
    throw new Error('pickOne: index out of range');
  }
  return ch;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const ai = arr[i];
    const aj = arr[j];
    if (ai !== undefined && aj !== undefined) {
      arr[i] = aj;
      arr[j] = ai;
    }
  }
}
