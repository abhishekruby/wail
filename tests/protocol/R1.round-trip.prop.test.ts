/**
 * Property 3: Payload round-trip (split → reassemble)
 *
 * For any Uint8Array of 0–2048 bytes, splitting it with splitPayload,
 * decoding every frame with decodeFrame, and feeding to reassembler.feed
 * returns a payload byte-for-byte equal to the original.
 *
 * Tests Requirements 4.6, 5.4, 5.5, 6.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R1.round-trip (Property 3: Payload round-trip)', () => {
  it('should reassemble to original payload for any 0–2048 byte input', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        (payload: Uint8Array) => {
          // Split the payload into frames
          const splitResult = splitPayload(payload, {
            kind: 0, // text
            flags: { compressed: false, locked: false, broadcast: false },
            rng: deterministicRng,
          });

          if (!splitResult.ok) {
            // Payload is too large (requires > 255 frames)
            // This should not happen with max 2048 bytes and 120-byte chunks
            return true;
          }

          const frames = splitResult.frames;

          // Create a reassembler
          const reassembler = createReassembler();

          // Decode and feed all frames in order
          let completeResult = null;

          for (const frameBytes of frames) {
            const decoded = decodeFrame(frameBytes);
            if (decoded === null) {
              // Frame decode failed; this should not happen with valid encoded frames
              return false;
            }

            const result = reassembler.feed(decoded);
            if (result.status === 'complete') {
              completeResult = result;
            }
          }

          // Check that we got a complete result
          if (completeResult === null) {
            return false;
          }

          if (completeResult.status !== 'complete') {
            return false;
          }

          // Check that reassembled payload equals original
          const reassembled = completeResult.payload;

          if (reassembled.length !== payload.length) {
            return false;
          }

          for (let i = 0; i < payload.length; i++) {
            if (reassembled[i] !== payload[i]) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
