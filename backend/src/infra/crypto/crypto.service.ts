import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ConfigService } from '../../core/config/config.service';

/**
 * AES-256-GCM column encryption for PII fields (Aadhaar, PAN, bank account).
 *
 * Format on disk: `base64( iv(12) || ciphertext || tag(16) )`. We store a
 * single self-contained string per column so callers don't have to manage
 * iv / tag side bytes. The 12-byte IV is the GCM recommended size; the
 * 16-byte tag is GCM's standard authenticator.
 *
 * Keying:
 *   - Production: key sourced from `PII_AES_KEY_B64` (base64-encoded 32
 *     bytes, validated by EnvSchema). Boot fails if absent or wrong length.
 *   - Development / test: if `PII_AES_KEY_B64` is unset, generate a stable
 *     per-process ephemeral key and emit a single warning. Aadhaar values
 *     written before a restart cannot be opened after — acceptable in dev.
 *
 * Per-tenant CMK (KMS-backed envelope keys) is a Sprint-18 hardening swap;
 * the {seal,open}String signatures do not change.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private static readonly IV_LENGTH = 12;
  private static readonly TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  private readonly logger = new Logger(CryptoService.name);
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  public onModuleInit(): void {
    const configured = this.config.crypto.piiKeyB64;
    if (configured !== undefined && configured.length > 0) {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length !== CryptoService.KEY_LENGTH) {
        throw new Error(
          `PII_AES_KEY_B64 must decode to ${CryptoService.KEY_LENGTH} bytes; got ${decoded.length}.`,
        );
      }
      this.key = decoded;
      return;
    }

    if (this.config.app.isProduction) {
      // Belt-and-braces — EnvSchema also blocks this, but never trust just
      // one layer for a production-only invariant.
      throw new Error('PII_AES_KEY_B64 is required in production.');
    }

    this.key = randomBytes(CryptoService.KEY_LENGTH);
    this.logger.warn(
      'Using ephemeral PII key — set PII_AES_KEY_B64 for stable Aadhaar storage across restarts.',
    );
  }

  /**
   * Encrypt a non-empty string. Returns base64(iv || ciphertext || tag).
   * Throws on empty input — callers should guard with a null/undefined check.
   */
  public sealString(plaintext: string): string {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new Error('CryptoService.sealString: plaintext must be a non-empty string.');
    }
    const key = this.requireKey();
    const iv = randomBytes(CryptoService.IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, tag]).toString('base64');
  }

  /**
   * Decrypt a sealed string. Throws if the input is malformed, tampered
   * with, or encrypted under a different key.
   */
  public openString(sealed: string): string {
    if (typeof sealed !== 'string' || sealed.length === 0) {
      throw new Error('CryptoService.openString: sealed must be a non-empty string.');
    }
    const key = this.requireKey();
    const buf = Buffer.from(sealed, 'base64');
    const minBytes = CryptoService.IV_LENGTH + CryptoService.TAG_LENGTH + 1;
    if (buf.length < minBytes) {
      throw new Error('CryptoService.openString: sealed payload is too short.');
    }
    const iv = buf.subarray(0, CryptoService.IV_LENGTH);
    const tag = buf.subarray(buf.length - CryptoService.TAG_LENGTH);
    const ciphertext = buf.subarray(CryptoService.IV_LENGTH, buf.length - CryptoService.TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /**
   * Return the trailing four digit characters of `plaintext`, after stripping
   * non-digits. Returns '' if fewer than 4 digits remain — callers decide
   * whether to persist an empty last4 or skip the column.
   */
  public last4(plaintext: string): string {
    if (typeof plaintext !== 'string') {
      return '';
    }
    const digits = plaintext.replace(/\D+/g, '');
    return digits.length >= 4 ? digits.slice(-4) : '';
  }

  /**
   * Render an Aadhaar / card-like number for UI surfaces: digits except the
   * last 4 become 'X', grouped in 4s. Returns '' for short or non-string
   * inputs.
   */
  public mask(plaintext: string): string {
    if (typeof plaintext !== 'string') {
      return '';
    }
    const digits = plaintext.replace(/\D+/g, '');
    if (digits.length < 4) {
      return '';
    }
    const masked = 'X'.repeat(digits.length - 4) + digits.slice(-4);
    return masked.replace(/(.{4})(?=.)/g, '$1-');
  }

  private requireKey(): Buffer {
    if (this.key === null) {
      throw new Error('CryptoService used before onModuleInit completed.');
    }
    return this.key;
  }
}
