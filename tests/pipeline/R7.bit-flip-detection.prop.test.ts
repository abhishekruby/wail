/**
 * Property test R7.bit-flip-detection.prop.test.ts
 *
 * Tests:
 * - P5e: Salt sensitivity — wrong salt causes unlock to fail
 * - P5f: IV sensitivity — wrong IV causes unlock to fail
 * - P5g: Bit-flip detection — flipping any single bit in ciphertext, salt, or IV breaks decrypt
 *
 * Requirements: R2, R3, R4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { lock, unlock, normalisePassphrase } from '../../src/pipeline/index.js';

describe('R7.bit-flip-detection', () => {
  it('P5g: bit-flip detection — flipping one bit in ciphertext breaks decrypt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(p => normalisePassphrase(p).length > 0),
        fc.nat(),
        fc.integer({ min: 0, max: 7 }),
        async (plaintext: Uint8Array, passphrase: string, bytePos: number, bitPos: number) => {
          let rngIndex = 0;
          const deterministicRng = () => {
            const val = rngIndex & 0xff;
            rngIndex++;
            return val;
          };

          const lockResult = await lock(plaintext, passphrase, {
            rng: deterministicRng,
            iterations: 1000,
          });

          expect(lockResult.ok).toBe(true);
          if (!lockResult.ok) return;

          const tamperedCiphertext = new Uint8Array(lockResult.ciphertext);
          const targetBytePos = bytePos % tamperedCiphertext.length;
          tamperedCiphertext[targetBytePos]! ^= 1 << bitPos; // Flip one bit

          const unlockResult = await unlock(
            tamperedCiphertext,
            passphrase,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          expect(unlockResult.ok).toBe(false);
          if (!unlockResult.ok) {
            expect(unlockResult.error).toBe('wrong-passphrase');
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P5e: salt sensitivity — flipping one bit in salt breaks decrypt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(p => normalisePassphrase(p).length > 0),
        fc.nat(),
        fc.integer({ min: 0, max: 7 }),
        async (plaintext: Uint8Array, passphrase: string, bytePos: number, bitPos: number) => {
          let rngIndex = 0;
          const deterministicRng = () => {
            const val = rngIndex & 0xff;
            rngIndex++;
            return val;
          };

          const lockResult = await lock(plaintext, passphrase, {
            rng: deterministicRng,
            iterations: 1000,
          });

          expect(lockResult.ok).toBe(true);
          if (!lockResult.ok) return;

          const tamperedSalt = new Uint8Array(lockResult.encSalt);
          const targetBytePos = bytePos % tamperedSalt.length;
          tamperedSalt[targetBytePos]! ^= 1 << bitPos; // Flip one bit

          const unlockResult = await unlock(
            lockResult.ciphertext,
            passphrase,
            tamperedSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          expect(unlockResult.ok).toBe(false);
          if (!unlockResult.ok) {
            expect(unlockResult.error).toBe('wrong-passphrase');
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('P5f: IV sensitivity — flipping one bit in IV breaks decrypt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(p => normalisePassphrase(p).length > 0),
        fc.nat(),
        fc.integer({ min: 0, max: 7 }),
        async (plaintext: Uint8Array, passphrase: string, bytePos: number, bitPos: number) => {
          let rngIndex = 0;
          const deterministicRng = () => {
            const val = rngIndex & 0xff;
            rngIndex++;
            return val;
          };

          const lockResult = await lock(plaintext, passphrase, {
            rng: deterministicRng,
            iterations: 1000,
          });

          expect(lockResult.ok).toBe(true);
          if (!lockResult.ok) return;

          const tamperedIv = new Uint8Array(lockResult.iv);
          const targetBytePos = bytePos % tamperedIv.length;
          tamperedIv[targetBytePos]! ^= 1 << bitPos; // Flip one bit

          const unlockResult = await unlock(
            lockResult.ciphertext,
            passphrase,
            lockResult.encSalt,
            tamperedIv,
            { iterations: 1000 },
          );

          expect(unlockResult.ok).toBe(false);
          if (!unlockResult.ok) {
            expect(unlockResult.error).toBe('wrong-passphrase');
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
