/**
 * Property 6: Incomplete frame set never yields bytes
 *
 * For any valid frame set with at least one data frame or the manifest removed,
 * the Reassembler never returns { status: 'complete' } — it always returns
 * { status: 'incomplete' }.
 *
 * Tests Requirements 5.7, 4.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R4.missing-frame (Property 6: Incomplete frame set never yields bytes)', () => {
  it('should never complete with one frame removed', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 2048 }), // Ensure at least one byte (at least one data frame)
        fc.integer({ min: 0 }), // frame index to remove (will be modded)
        (payload: Uint8Array, frameIndexRaw: number) => {
          // Split the payload into frames
          const splitResult = splitPayload(payload, {
            kind: 0,
            flags: { compressed: false, locked: false, broadcast: false },
            rng: deterministicRng,
          });

          if (!splitResult.ok) {
            return true;
          }

          const frames = splitResult.frames;

          if (frames.length === 0) {
            // Empty frame set (should not happen with non-empty payload)
            return true;
          }

          // Pick a frame to remove
          const frameIndex = frameIndexRaw % frames.length;

          // Remove that frame
          const incompleteFrames = frames.filter((_: Uint8Array, idx: number) => idx !== frameIndex);

          // Create reassembler and feed incomplete frames
          const reassembler = createReassembler();
          let hadComplete = false;

          for (const frameBytes of incompleteFrames) {
            const decoded = decodeFrame(frameBytes);
            if (decoded === null) {
              return false;
            }

            const result = reassembler.feed(decoded);
            if (result.status === 'complete') {
              hadComplete = true;
            }
          }

          // Should NOT have completed
          return !hadComplete;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
