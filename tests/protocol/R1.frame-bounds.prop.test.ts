/**
 * Property 4: Frame-length bounds
 *
 * For any payload of 0–2048 bytes, every frame produced by splitPayload
 * has byte length in the closed interval [MIN_FRAME, MAX_FRAME].
 *
 * Validates: Requirements 2.7, 4.7, 1.3, 1.4
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { splitPayload } from '../../src/protocol/splitter.js';
import { MIN_FRAME, MAX_FRAME } from '../../src/protocol/constants.js';
import type { ManifestFlags } from '../../src/protocol/types.js';

describe('R1: Frame bounds (Property 4)', () => {
  it('every frame produced by splitPayload has length in [MIN_FRAME, MAX_FRAME]', () => {
    const arbPayload = fc.uint8Array({ minLength: 0, maxLength: 2048 });

    fc.assert(
      fc.property(arbPayload, (payload: Uint8Array) => {
        // Use deterministic RNG for reproducibility
        let rngIndex = 0;
        const rngBytes = new Uint8Array(1000);
        // Fill with predictable values
        for (let i = 0; i < rngBytes.length; i++) {
          rngBytes[i] = (i * 7 + 11) & 0xff;
        }

        const rng = () => {
          const val = rngBytes[rngIndex % rngBytes.length]!;
          rngIndex++;
          return val;
        };

        const flags: ManifestFlags = {
          compressed: false,
          locked: false,
          broadcast: false,
        };

        const result = splitPayload(payload, {
          kind: 0,
          flags,
          rng,
        });

        if (!result.ok) {
          throw new Error(`splitPayload failed: ${result.error}`);
        }

        // Check every frame
        for (let i = 0; i < result.frames.length; i++) {
          const frame = result.frames[i]!;
          if (frame.length < MIN_FRAME) {
            throw new Error(
              `Frame ${i} is too short: ${frame.length} < MIN_FRAME (${MIN_FRAME})`
            );
          }
          if (frame.length > MAX_FRAME) {
            throw new Error(
              `Frame ${i} is too long: ${frame.length} > MAX_FRAME (${MAX_FRAME})`
            );
          }
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('handles empty payload correctly', () => {
    const rng = () => 0x42;
    const flags: ManifestFlags = {
      compressed: false,
      locked: false,
      broadcast: false,
    };

    const result = splitPayload(new Uint8Array(0), {
      kind: 0,
      flags,
      rng,
    });

    if (!result.ok) {
      throw new Error(`splitPayload failed for empty payload: ${result.error}`);
    }

    // Should have 1 frame (manifest only, no data frames)
    if (result.frames.length !== 1) {
      throw new Error(
        `Expected 1 frame for empty payload, got ${result.frames.length}`
      );
    }

    const frame = result.frames[0]!;
    if (frame.length < MIN_FRAME || frame.length > MAX_FRAME) {
      throw new Error(
        `Manifest frame for empty payload is out of bounds: ${frame.length}`
      );
    }
  });
});
