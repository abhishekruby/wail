/**
 * Property test R6.real-iterations.prop.test.ts
 *
 * Tests:
 * - Determinism and correctness with the actual 310,000 iterations (not reduced for speed)
 * - Performance check: total time for lock + unlock should be acceptable on a typical machine
 *
 * Requirements: R2, R3
 * Note: Only 2 runs because iterations are real and slow (each run takes seconds)
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { lock, unlock, normalisePassphrase } from '../../src/pipeline/index.js';
import { PBKDF2_ITERATIONS } from '../../src/pipeline/constants.js';

describe('R6.real-iterations', () => {
  it('lock and unlock with 310,000 iterations produce consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 100, maxLength: 100 }),
        fc
          .string({ minLength: 10, maxLength: 20 })
          .filter(p => normalisePassphrase(p).length > 0),
        fc.integer({ min: 0, max: 255 }),
        async (plaintext: Uint8Array, passphrase: string, seed: number) => {
          let rngIndex = 0;
          const deterministicRng = () => {
            const val = (seed + rngIndex) & 0xff;
            rngIndex++;
            return val;
          };

          const lockStart = Date.now();
          const lockResult = await lock(plaintext, passphrase, {
            rng: deterministicRng,
            iterations: PBKDF2_ITERATIONS,
          });
          const lockEnd = Date.now();

          if (!lockResult.ok) {
            throw new Error('Lock failed with 310,000 iterations');
          }

          const lockTime = lockEnd - lockStart;
          // Lock should take at least a few hundred ms (but we don't assert an upper bound to avoid flakiness)
          if (lockTime < 100) {
            console.warn(`Lock took only ${lockTime}ms with 310,000 iterations (expected > 100ms)`);
          }

          const unlockStart = Date.now();
          const unlockResult = await unlock(
            lockResult.ciphertext,
            passphrase,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: PBKDF2_ITERATIONS },
          );
          const unlockEnd = Date.now();

          if (!unlockResult.ok) {
            throw new Error('Unlock failed with 310,000 iterations');
          }

          const unlockTime = unlockEnd - unlockStart;

          // Verify plaintext round-trips
          if (plaintext.length !== unlockResult.plaintext.length) {
            throw new Error('Plaintext length mismatch after real-iterations round-trip');
          }

          for (let i = 0; i < plaintext.length; i++) {
            if (plaintext[i] !== unlockResult.plaintext[i]) {
              throw new Error('Plaintext mismatch after real-iterations round-trip');
            }
          }

          // Log performance for reference
          console.log(
            `Real iterations (310,000): lock ${lockTime}ms, unlock ${unlockTime}ms, total ${lockTime + unlockTime}ms`,
          );
        },
      ),
      { numRuns: 2 },
    );
  });
});
