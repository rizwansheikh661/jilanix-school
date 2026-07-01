import { Test } from '@nestjs/testing';

import { ConfigService } from '../../core/config/config.service';
import { CryptoService } from './crypto.service';

/**
 * A deterministic test key — 32 zero bytes encoded base64 is 'AAAA...' (44
 * chars). Using a fixed key keeps the seal/open round-trip predictable.
 */
const TEST_KEY_B64 = Buffer.alloc(32, 0).toString('base64');

function makeStub(opts: { piiKeyB64?: string; isProduction?: boolean }): ConfigService {
  return {
    crypto: { piiKeyB64: opts.piiKeyB64 },
    app: {
      isProduction: opts.isProduction === true,
      isDevelopment: opts.isProduction !== true,
      isStaging: false,
      isTest: false,
    },
  } as unknown as ConfigService;
}

async function makeService(stub: ConfigService): Promise<CryptoService> {
  const mod = await Test.createTestingModule({
    providers: [
      CryptoService,
      { provide: ConfigService, useValue: stub },
    ],
  }).compile();
  const svc = mod.get(CryptoService);
  svc.onModuleInit();
  return svc;
}

describe('CryptoService', () => {
  describe('initialisation', () => {
    it('boots with a valid 32-byte base64 key', async () => {
      const svc = await makeService(makeStub({ piiKeyB64: TEST_KEY_B64 }));
      expect(() => svc.sealString('hello')).not.toThrow();
    });

    it('rejects a key that decodes to the wrong byte length', async () => {
      const shortKey = Buffer.alloc(16, 0).toString('base64');
      const stub = makeStub({ piiKeyB64: shortKey });
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          { provide: ConfigService, useValue: stub },
        ],
      }).compile();
      const svc = mod.get(CryptoService);
      expect(() => svc.onModuleInit()).toThrow(/must decode to 32 bytes/);
    });

    it('throws in production when key is missing', async () => {
      const stub = makeStub({ piiKeyB64: undefined, isProduction: true });
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          { provide: ConfigService, useValue: stub },
        ],
      }).compile();
      const svc = mod.get(CryptoService);
      expect(() => svc.onModuleInit()).toThrow(/required in production/);
    });

    it('falls back to an ephemeral key in development with a warning', async () => {
      const svc = await makeService(makeStub({ piiKeyB64: undefined }));
      const sealed = svc.sealString('ephemeral');
      expect(svc.openString(sealed)).toBe('ephemeral');
    });
  });

  describe('sealString / openString round-trip', () => {
    let svc: CryptoService;

    beforeAll(async () => {
      svc = await makeService(makeStub({ piiKeyB64: TEST_KEY_B64 }));
    });

    it('round-trips an Aadhaar-shaped 12-digit string', () => {
      const aadhaar = '123456789012';
      const sealed = svc.sealString(aadhaar);
      expect(sealed).not.toContain(aadhaar);
      expect(svc.openString(sealed)).toBe(aadhaar);
    });

    it('produces a different ciphertext each call (random IV)', () => {
      const a = svc.sealString('same-plaintext');
      const b = svc.sealString('same-plaintext');
      expect(a).not.toBe(b);
      expect(svc.openString(a)).toBe(svc.openString(b));
    });

    it('throws on empty plaintext', () => {
      expect(() => svc.sealString('')).toThrow();
    });

    it('throws on a tampered ciphertext', () => {
      const sealed = svc.sealString('PAN12345A');
      const tampered = `${sealed.slice(0, -4)}XXXX`;
      expect(() => svc.openString(tampered)).toThrow();
    });

    it('throws on an empty sealed value', () => {
      expect(() => svc.openString('')).toThrow();
    });

    it('throws on a payload shorter than iv+tag', () => {
      expect(() => svc.openString(Buffer.alloc(4).toString('base64'))).toThrow(/too short/);
    });
  });

  describe('last4 / mask', () => {
    let svc: CryptoService;

    beforeAll(async () => {
      svc = await makeService(makeStub({ piiKeyB64: TEST_KEY_B64 }));
    });

    it('extracts trailing 4 digits ignoring separators', () => {
      expect(svc.last4('1234-5678-9012')).toBe('9012');
      expect(svc.last4('1234 5678 9012')).toBe('9012');
    });

    it('returns empty string when fewer than 4 digits', () => {
      expect(svc.last4('12')).toBe('');
      expect(svc.last4('')).toBe('');
    });

    it('renders a masked aadhaar with last4 visible', () => {
      const masked = svc.mask('123456789012');
      expect(masked.endsWith('9012')).toBe(true);
      expect(masked).not.toContain('1234');
    });

    it('returns empty string from mask for short inputs', () => {
      expect(svc.mask('12')).toBe('');
    });
  });
});
