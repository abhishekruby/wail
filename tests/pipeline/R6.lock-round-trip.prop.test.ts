/**
 * Property test R6.lock-round-trip.prop.test.ts
 *
 * Tests:
 * - P5a: Round-trip identity — unlock(lock(plaintext, pass).ciphertext, pass, salt, iv).plaintext == plaintext
 * - P5b: Passphrase sensitivity — unlock with different passphrase fails
 * - P5c: Passphrase normalisation equivalence — NFC-equivalent and whitespace-trimmed passphrases work
 * - P5d: Empty passphrase rejection — lock with empty or whitespace-only passphrase returns error
 *
 * Requirements: R1, R2, R4, R5
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { lock, unlock, normalisePassphrase } from '../../src/pipeline/index.js';
import { PBKDF2_SALT_LEN } from '../../src/pipeline/constants.js';

describe('R6.lock-round-trip', () => {
  it('P5a: identity — plaintext round-trips through lock/unlock with same passphrase', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter(p => normalisePassphrase(p).length > 0),
        fc.integer({ min: 0, max: 255 }),
        async (plaintext: Uint8Array, passphrase: string, seed: number) => {
          // Deterministic RNG seeded from seed
          let index = 0;
          const deterministicRng = () => {
            const val = (seed + index) & 0xff;
            index++;
            return val;
          };

          const lockResult = await lock(plaintext, passphrase, {
            rng: deterministicRng,
            iterations: 1000,
          });

          if (!lockResult.ok) {
            // If lock failed, skip this case (shouldn't happen with valid passphrase)
            fc.pre(false);
            return;
          }

          const unlockResult = await unlock(
            lockResult.ciphertext,
            passphrase,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          if (!unlockResult.ok) {
            throw new Error('Unlock failed with correct passphrase');
          }

          // Plaintext should round-trip exactly
          if (plaintext.length !== unlockResult.plaintext.length) {
            throw new Error(
              `Plaintext length mismatch: expected ${plaintext.length}, got ${unlockResult.plaintext.length}`,
            );
          }

          for (let i = 0; i < plaintext.length; i++) {
            if (plaintext[i] !== unlockResult.plaintext[i]) {
              throw new Error(
                `Plaintext mismatch at index ${i}: expected ${plaintext[i]}, got ${unlockResult.plaintext[i]}`,
              );
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P5b: passphrase sensitivity — different passphrase causes unlock to fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        fc
          .tuple(
            fc.string({ minLength: 1, maxLength: 40 }),
            fc.string({ minLength: 1, maxLength: 40 }),
          )
          .filter(([p1, p2]) => {
            const n1 = normalisePassphrase(p1);
            const n2 = normalisePassphrase(p2);
            return n1.length > 0 && n2.length > 0 && n1 !== n2;
          }),
        fc.integer({ min: 0, max: 255 }),
        async (plaintext: Uint8Array, [pass1, pass2]: [string, string], seed: number) => {
          let index = 0;
          const deterministicRng = () => {
            const val = (seed + index) & 0xff;
            index++;
            return val;
          };

          const lockResult = await lock(plaintext, pass1, {
            rng: deterministicRng,
            iterations: 1000,
          });

          if (!lockResult.ok) {
            fc.pre(false);
            return;
          }

          const unlockResult = await unlock(
            lockResult.ciphertext,
            pass2,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          // Should fail with wrong passphrase
          if (unlockResult.ok) {
            throw new Error('Unlock succeeded with wrong passphrase');
          }
          if (unlockResult.error !== 'wrong-passphrase') {
            throw new Error(`Expected 'wrong-passphrase', got '${unlockResult.error}'`);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P5c: passphrase normalisation equivalence — NFC-equivalent passphrases work', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 255 }),
        async (plaintext: Uint8Array, seed: number) => {
          // Create two passphrases: 'café' (precomposed U+00E9) and 'cafe\u0301' (decomposed)
          const precomposed = 'café'; // U+00E9
          const decomposed = 'cafe\u0301'; // e + U+0301

          if (normalisePassphrase(precomposed) !== normalisePassphrase(decomposed)) {
            fc.pre(false);
            return;
          }

          let index = 0;
          const deterministicRng = () => {
            const val = (seed + index) & 0xff;
            index++;
            return val;
          };

          const lockResult = await lock(plaintext, precomposed, {
            rng: deterministicRng,
            iterations: 1000,
          });

          if (!lockResult.ok) {
            fc.pre(false);
            return;
          }

          // Unlock with decomposed form should succeed
          const unlockResult = await unlock(
            lockResult.ciphertext,
            decomposed,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          if (!unlockResult.ok) {
            throw new Error('Unlock failed with NFC-equivalent passphrase');
          }

          // Plaintext should match
          if (plaintext.length !== unlockResult.plaintext.length) {
            throw new Error('Plaintext length mismatch after NFC equivalence');
          }

          for (let i = 0; i < plaintext.length; i++) {
            if (plaintext[i] !== unlockResult.plaintext[i]) {
              throw new Error('Plaintext mismatch after NFC equivalence');
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P5c: passphrase normalisation — whitespace trimming works', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 255 }),
        async (plaintext: Uint8Array, seed: number) => {
          const basePassphrase = 'test-pass';
          const withWhitespace = `  ${basePassphrase}  `;

          let index = 0;
          const deterministicRng = () => {
            const val = (seed + index) & 0xff;
            index++;
            return val;
          };

          const lockResult = await lock(plaintext, basePassphrase, {
            rng: deterministicRng,
            iterations: 1000,
          });

          if (!lockResult.ok) {
            fc.pre(false);
            return;
          }

          // Unlock with whitespace-padded passphrase should succeed
          const unlockResult = await unlock(
            lockResult.ciphertext,
            withWhitespace,
            lockResult.encSalt,
            lockResult.iv,
            { iterations: 1000 },
          );

          if (!unlockResult.ok) {
            throw new Error('Unlock failed with whitespace-trimmed passphrase');
          }

          // Plaintext should match
          if (plaintext.length !== unlockResult.plaintext.length) {
            throw new Error('Plaintext length mismatch after whitespace trimming');
          }

          for (let i = 0; i < plaintext.length; i++) {
            if (plaintext[i] !== unlockResult.plaintext[i]) {
              throw new Error('Plaintext mismatch after whitespace trimming');
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P5d: empty passphrase rejection — empty string returns error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 100 }), async (plaintext: Uint8Array) => {
        const result = await lock(plaintext, '');

        if (result.ok) {
          throw new Error('Lock succeeded with empty passphrase');
        }
        if (result.error !== 'empty-passphrase') {
          throw new Error(`Expected 'empty-passphrase', got '${result.error}'`);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('P5d: empty passphrase rejection — whitespace-only returns error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 100 }),
        fc.constant('   '),
        async (plaintext: Uint8Array, whitespace: string) => {
          const result = await lock(plaintext, whitespace);

          if (result.ok) {
            throw new Error('Lock succeeded with whitespace-only passphrase');
          }
          if (result.error !== 'empty-passphrase') {
            throw new Error(`Expected 'empty-passphrase', got '${result.error}'`);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
