/**
 * JwtKeysService — load + decode the RS256 keypair at boot.
 *
 * Keys live in `JWT_PRIVATE_KEY_BASE64` and `JWT_PUBLIC_KEY_BASE64` so they
 * survive shell quoting / docker-compose / CI vars without escaping the
 * PEM newlines. We decode once at module init, validate they're a real
 * PEM-encoded keypair, and hold the raw PEM strings + a sha256 fingerprint
 * (`kid`) for the JWT header.
 *
 * Fail-fast: missing or malformed keys cause a hard error at boot — every
 * JWT operation depends on them, so there is no graceful degradation.
 *
 * `kid` (JWT key id) is derived from the public-key SHA-256 prefix. When
 * we add key rotation, the strategy can pick a public key by `kid`
 * without having to re-derive it on every request.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { ConfigService } from '../../config';

export interface JwtKeys {
  readonly privateKey: string;
  readonly publicKey: string;
  readonly kid: string;
}

@Injectable()
export class JwtKeysService {
  private readonly logger = new Logger(JwtKeysService.name);
  private readonly keys: JwtKeys;

  constructor(private readonly config: ConfigService) {
    this.keys = this.loadKeys();
    this.logger.log(`JWT keys loaded (kid=${this.keys.kid})`);
  }

  public getKeys(): JwtKeys {
    return this.keys;
  }

  public get privateKey(): string {
    return this.keys.privateKey;
  }

  public get publicKey(): string {
    return this.keys.publicKey;
  }

  public get kid(): string {
    return this.keys.kid;
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private loadKeys(): JwtKeys {
    const { privateKeyBase64, publicKeyBase64 } = this.config.jwt;
    if (privateKeyBase64 === undefined || privateKeyBase64.length === 0) {
      throw new Error(
        'JwtKeysService cannot start: JWT_PRIVATE_KEY_BASE64 is not set. ' +
          'Generate a keypair (see docs/auth/keys.md) and set both JWT_*_BASE64 vars.',
      );
    }
    if (publicKeyBase64 === undefined || publicKeyBase64.length === 0) {
      throw new Error(
        'JwtKeysService cannot start: JWT_PUBLIC_KEY_BASE64 is not set.',
      );
    }
    const privateKey = decodeBase64Pem(privateKeyBase64, 'JWT_PRIVATE_KEY_BASE64');
    const publicKey = decodeBase64Pem(publicKeyBase64, 'JWT_PUBLIC_KEY_BASE64');

    assertPem(privateKey, 'PRIVATE KEY', 'JWT_PRIVATE_KEY_BASE64');
    assertPem(publicKey, 'PUBLIC KEY', 'JWT_PUBLIC_KEY_BASE64');

    const kid = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
    return { privateKey, publicKey, kid };
  }
}

function decodeBase64Pem(value: string, varName: string): string {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (err) {
    throw new Error(`${varName} is not valid base64: ${(err as Error).message}`);
  }
}

function assertPem(pem: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY', varName: string): void {
  // We accept any PKCS#8 / SEC1 / RSA / EC PEM form that contains the
  // required marker — Node's crypto layer will reject anything actually
  // malformed when we sign/verify.
  const beginMarker = `-----BEGIN `;
  const endMarker = `-----END `;
  if (!pem.includes(beginMarker) || !pem.includes(endMarker)) {
    throw new Error(`${varName} did not decode to a PEM-formatted ${kind}.`);
  }
  if (kind === 'PRIVATE KEY' && !/PRIVATE KEY-----/.test(pem)) {
    throw new Error(`${varName} decoded to a public key — expected a private key.`);
  }
  if (kind === 'PUBLIC KEY' && !/PUBLIC KEY-----/.test(pem)) {
    throw new Error(`${varName} decoded to a private key — expected a public key.`);
  }
}
