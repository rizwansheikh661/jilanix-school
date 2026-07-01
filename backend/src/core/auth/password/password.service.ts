/**
 * PasswordService — argon2id wrapper.
 *
 * Why a wrapper, not direct `argon2.hash` calls?
 *   - We pin the algorithm + parameters in one place. If the calibrated
 *     params drift over time, `needsRehash()` flags stored hashes that
 *     should be upgraded on the user's next successful login.
 *   - We layer an optional pepper (env-secret) on top of the per-user salt,
 *     hashing `password + pepper` before argon2 sees it. Pepper rotation is
 *     tracked via UserPassword.pepperVersion so verifies during a rotation
 *     window can try v_n then v_{n-1}.
 *   - Hash verification is *constant-time* against malformed PHC strings
 *     (argon2.verify already handles that, but we centralise the catch).
 *
 * Calibration:
 *   Argon2id params (memoryCost, timeCost, parallelism) are intentionally
 *   not in env. They are the OWASP-recommended defaults, frozen here.
 *   When we need to bump them, we change the constant and let
 *   `needsRehash()` quietly upgrade users on next login.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

import { ConfigService } from '../../config';

export interface Argon2Params {
  readonly type: 'argon2id';
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

/**
 * OWASP 2024 recommendation for argon2id (interactive logins): 19 MiB
 * memory, 2 iterations, 1 thread. Override at boot in tests via the
 * exported constant if a CI machine can't afford 19 MiB per attempt.
 */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  type: 'argon2id',
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export interface HashResult {
  readonly passwordHash: string;
  readonly algorithm: 'argon2id';
  readonly params: Argon2Params;
  readonly pepperVersion: number;
}

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly params: Argon2Params = DEFAULT_ARGON2_PARAMS;

  constructor(private readonly config: ConfigService) {}

  /** Hash a cleartext password with the current calibrated params + pepper. */
  public async hash(password: string): Promise<HashResult> {
    const peppered = this.applyPepper(password);
    const passwordHash = await argon2.hash(peppered, {
      type: argon2.argon2id,
      memoryCost: this.params.memoryCost,
      timeCost: this.params.timeCost,
      parallelism: this.params.parallelism,
    });
    return {
      passwordHash,
      algorithm: 'argon2id',
      params: this.params,
      pepperVersion: this.currentPepperVersion(),
    };
  }

  /**
   * Verify cleartext against a stored PHC hash. Returns `false` for any
   * malformed input — callers should NOT distinguish "wrong password"
   * from "corrupt hash" in user-facing errors.
   */
  public async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, this.applyPepper(password));
    } catch (err) {
      // Malformed hash, unknown algorithm, etc. Log once for ops; return
      // false so the caller short-circuits to InvalidCredentialsError.
      this.logger.warn(`argon2 verify failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Decide whether a stored hash should be re-derived on next successful
   * login. Returns true when the stored params lag behind current
   * calibration OR when the pepper version moved on.
   */
  public needsRehash(stored: { params: Argon2Params; pepperVersion: number }): boolean {
    if (stored.pepperVersion !== this.currentPepperVersion()) {
      return true;
    }
    const cur = this.params;
    return (
      stored.params.memoryCost < cur.memoryCost ||
      stored.params.timeCost < cur.timeCost ||
      stored.params.parallelism < cur.parallelism
    );
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private applyPepper(password: string): string {
    const pepper = this.config.jwt.passwordPepper;
    if (pepper === undefined || pepper.length === 0) {
      return password;
    }
    return `${password}${pepper}`;
  }

  /** Pepper versioning is reserved for future rotation — always 1 today. */
  private currentPepperVersion(): number {
    return 1;
  }
}
