/**
 * Unit tests for the crypto layer.
 *
 * Tests:
 * - RFC 6070 known-answer test for PBKDF2-SHA-256
 * - Passphrase normalisation (NFC, whitespace trimming)
 * - Empty passphrase rejection
 * - Round-trip encryption/decryption with known inputs
 * - Tampered ciphertext/salt/IV detection
 * - Wrong passphrase detection
 * - Size validation for salt and IV
 */

import { describe, it, expect } from 'vitest';
import { lock, unlock, normalisePassphrase } from '../../src/pipeline/index.js';
import { deriveBits } from '../../src/pipeline/derive-key.js';

describe('pipeline unit tests', () => {
  describe('RFC 6070 known-answer test', () => {
    it('PBKDF2-SHA-256 vector: password, salt, 1 iteration', async () => {
      const passphrase = 'password';
      const salt = new TextEncoder().encode('salt');

      const bits = await deriveBits(passphrase, salt, 1);

      // Expected result from RFC 6070 / RFC 7914
      const expected = new Uint8Array([
        0x12, 0x0f, 0xb6, 0xcf, 0xfc, 0xf8, 0xb3, 0x2c, 0x43, 0xe7, 0x22, 0x52, 0x56, 0xc4, 0xf8, 0x37,
        0xa8, 0x65, 0x48, 0xc9, 0x2c, 0xcc, 0x35, 0x48, 0x08, 0x05, 0x98, 0x7c, 0xb7, 0x0b, 0xe1, 0x7b,
      ]);

      if (bits.length !== expected.length) {
        throw new Error(`Length mismatch: got ${bits.length}, expected ${expected.length}`);
      }

      for (let i = 0; i < bits.length; i++) {
        if (bits[i] !== expected[i]) {
          throw new Error(
            `Byte mismatch at index ${i}: got ${bits[i]!.toString(16)}, expected ${expected[i]!.toString(16)}`,
          );
        }
      }
    });
  });

  describe('normalisePassphrase', () => {
    it('trims leading and trailing whitespace', () => {
      const result = normalisePassphrase('  test  ');
      expect(result).toBe('test');
    });

    it('handles NFC normalisation: precomposed café', () => {
      const precomposed = normalisePassphrase('café'); // U+00E9
      const decomposed = normalisePassphrase('cafe\u0301'); // e + U+0301
      expect(precomposed).toBe(decomposed);
    });

    it('returns empty string for empty input', () => {
      expect(normalisePassphrase('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalisePassphrase('   ')).toBe('');
    });
  });

  describe('lock with empty passphrases', () => {
    it('rejects empty passphrase', async () => {
      const plaintext = new Uint8Array([1, 2, 3]);
      const result = await lock(plaintext, '');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('empty-passphrase');
      }
    });

    it('rejects whitespace-only passphrase', async () => {
      const plaintext = new Uint8Array([1, 2, 3]);
      const result = await lock(plaintext, '   ');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('empty-passphrase');
      }
    });
  });

  describe('round-trip encryption/decryption', () => {
    it('lock then unlock with deterministic RNG returns plaintext', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const passphrase = 'test-pass';

      // Deterministic RNG (all bytes = 0)
      const deterministicRng = (() => {
        let count = 0;
        return () => {
          count++;
          return 0;
        };
      })();

      const lockResult = await lock(plaintext, passphrase, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      // Verify sizes
      expect(lockResult.ciphertext.length).toBe(plaintext.length + 16); // plaintext + tag
      expect(lockResult.encSalt.length).toBe(16);
      expect(lockResult.iv.length).toBe(12);

      const unlockResult = await unlock(
        lockResult.ciphertext,
        passphrase,
        lockResult.encSalt,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(true);
      if (!unlockResult.ok) return;

      expect(unlockResult.plaintext.length).toBe(plaintext.length);
      for (let i = 0; i < plaintext.length; i++) {
        expect(unlockResult.plaintext[i]).toBe(plaintext[i]);
      }
    });

    it('unlock preserves empty plaintext', async () => {
      const plaintext = new Uint8Array([]);
      const passphrase = 'test-pass';

      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, passphrase, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const unlockResult = await unlock(
        lockResult.ciphertext,
        passphrase,
        lockResult.encSalt,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(true);
      if (!unlockResult.ok) return;
      expect(unlockResult.plaintext.length).toBe(0);
    });
  });

  describe('tampered ciphertext/salt/iv detection', () => {
    it('tampered ciphertext fails unlock', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const passphrase = 'test-pass';
      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, passphrase, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const tampered = new Uint8Array(lockResult.ciphertext);
      tampered[0]! ^= 0x01; // Flip one bit

      const unlockResult = await unlock(
        tampered,
        passphrase,
        lockResult.encSalt,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(false);
      if (unlockResult.ok) return;
      expect(unlockResult.error).toBe('wrong-passphrase');
    });

    it('tampered salt fails unlock', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const passphrase = 'test-pass';
      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, passphrase, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const tampered = new Uint8Array(lockResult.encSalt);
      tampered[0]! ^= 0x01; // Flip one bit

      const unlockResult = await unlock(
        lockResult.ciphertext,
        passphrase,
        tampered,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(false);
      if (unlockResult.ok) return;
      expect(unlockResult.error).toBe('wrong-passphrase');
    });

    it('tampered IV fails unlock', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const passphrase = 'test-pass';
      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, passphrase, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const tampered = new Uint8Array(lockResult.iv);
      tampered[0]! ^= 0x01; // Flip one bit

      const unlockResult = await unlock(
        lockResult.ciphertext,
        passphrase,
        lockResult.encSalt,
        tampered,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(false);
      if (unlockResult.ok) return;
      expect(unlockResult.error).toBe('wrong-passphrase');
    });
  });

  describe('wrong passphrase detection', () => {
    it('wrong passphrase fails unlock', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const correctPass = 'correct';
      const wrongPass = 'wrong';

      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, correctPass, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const unlockResult = await unlock(
        lockResult.ciphertext,
        wrongPass,
        lockResult.encSalt,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(false);
      if (unlockResult.ok) return;
      expect(unlockResult.error).toBe('wrong-passphrase');
    });

    it('case-sensitive passphrase check', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const correctPass = 'correct';
      const wrongPass = 'CORRECT';

      const deterministicRng = () => 0;

      const lockResult = await lock(plaintext, correctPass, {
        rng: deterministicRng,
        iterations: 1000,
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) return;

      const unlockResult = await unlock(
        lockResult.ciphertext,
        wrongPass,
        lockResult.encSalt,
        lockResult.iv,
        { iterations: 1000 },
      );

      expect(unlockResult.ok).toBe(false);
      if (unlockResult.ok) return;
      expect(unlockResult.error).toBe('wrong-passphrase');
    });
  });

  describe('salt and IV size validation', () => {
    it('wrong salt size returns wrong-passphrase', async () => {
      const ciphertext = new Uint8Array([1, 2, 3]);
      const passphrase = 'test';
      const wrongSalt = new Uint8Array([1, 2, 3]); // Wrong size (should be 16)
      const iv = new Uint8Array(12);

      const result = await unlock(ciphertext, passphrase, wrongSalt, iv);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('wrong-passphrase');
    });

    it('wrong IV size returns wrong-passphrase', async () => {
      const ciphertext = new Uint8Array([1, 2, 3]);
      const passphrase = 'test';
      const salt = new Uint8Array(16);
      const wrongIv = new Uint8Array([1, 2, 3]); // Wrong size (should be 12)

      const result = await unlock(ciphertext, passphrase, salt, wrongIv);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('wrong-passphrase');
    });
  });
});
