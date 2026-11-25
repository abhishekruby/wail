/**
 * Property test R6.fresh-randomness.prop.test.ts
 *
 * Tests:
 * - P5h: Fresh randomness — calling lock twice with the same inputs but no injected RNG
 *   produces different ciphertexts due to different salts and IVs
 *
 * Requirements: R3
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { lock, normalisePassphrase } from '../../src/pipeline/index.js';

describe('R6.fresh-randomness', () => {
  it('P5h: fresh randomness — 10 lock calls with same input produce different ciphertexts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 10, maxLength: 100 }),
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(p => normalisePassphrase(p).length > 0),
        async (plaintext: Uint8Array, passphrase: string) => {
          const results = [];

          for (let i = 0; i < 10; i++) {
            const result = await lock(plaintext, passphrase, { iterations: 1000 });
            if (!result.ok) {
              throw new Error(`Lock failed on iteration ${i}`);
            }
            results.push(result);
          }

          // All 10 ciphertexts should be different (using system CSPRNG, should be unique)
          for (let i = 0; i < results.length; i++) {
            for (let j = i + 1; j < results.length; j++) {
              const ci = results[i]!.ciphertext;
              const cj = results[j]!.ciphertext;

              if (ci.length !== cj.length) {
                // Different lengths would be weird but let's skip this case
                continue;
              }

              let ciphersAreIdentical = true;
              for (let k = 0; k < ci.length; k++) {
                if (ci[k] !== cj[k]) {
                  ciphersAreIdentical = false;
                  break;
                }
              }

              if (ciphersAreIdentical) {
                throw new Error(`Ciphertexts at indices ${i} and ${j} are identical (should be different)`);
              }

              // Also check that salts are different
              const si = results[i]!.encSalt;
              const sj = results[j]!.encSalt;
              let saltsAreIdentical = true;
              for (let k = 0; k < si.length; k++) {
                if (si[k] !== sj[k]) {
                  saltsAreIdentical = false;
                  break;
                }
              }

              if (saltsAreIdentical) {
                throw new Error(`Salts at indices ${i} and ${j} are identical (should be different)`);
              }

              // Also check that IVs are different
              const ii = results[i]!.iv;
              const ij = results[j]!.iv;
              let ivsAreIdentical = true;
              for (let k = 0; k < ii.length; k++) {
                if (ii[k] !== ij[k]) {
                  ivsAreIdentical = false;
                  break;
                }
              }

              if (ivsAreIdentical) {
                throw new Error(`IVs at indices ${i} and ${j} are identical (should be different)`);
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
