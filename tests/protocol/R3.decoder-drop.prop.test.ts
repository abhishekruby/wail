/**
 * Property 2: Single-byte corruption drops frame
 *
 * For any valid encoded frame, flipping any single byte at any position
 * in the whitened region (index >= 1) causes decodeFrame to return null.
 *
 * Tests Requirements 3.6, 3.3
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { buildFrame } from '../../src/protocol/frame-encoder.js';
import { decodeFrame } from '../../src/protocol/frame-decoder.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R3.decoder-drop (Property 2: Single-byte corruption drops frame)', () => {
  it('should drop a frame when any single byte in the whitened region is corrupted', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 120 }),
        fc.integer({ min: 0, max: 65535 }), // messageId
        fc.integer({ min: 0, max: 255 }), // seq
        fc.integer({ min: 1, max: 255 }), // corruption mask (non-zero)
        (body: Uint8Array, messageId: number, seq: number, mask: number) => {
          // Build a frame with deterministic RNG
          const result = buildFrame(
            {
              type: seq === 0 ? 0 : 1,
              messageId,
              seq,
              body,
            },
            { rng: deterministicRng }
          );

          if (!result.ok) {
            // If frame building failed, skip this case
            return true;
          }

          const frame = result.frame;

          // For each byte in the whitened region (index >= 1)
          for (let i = 1; i < frame.length; i++) {
            // Corrupt exactly one byte
            const corrupted = new Uint8Array(frame);
            corrupted[i] = (corrupted[i]! ^ mask) & 0xff;

            // Decoding should return null
            const decoded = decodeFrame(corrupted);
            if (decoded !== null) {
              return false; // Test failed
            }
          }

          return true; // All corruptions were caught
        }
      ),
      { numRuns: 1000 }
    );
  });
});
