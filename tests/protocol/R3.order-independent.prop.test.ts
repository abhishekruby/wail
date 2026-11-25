/**
 * Property 5: Order-independence and duplicate-tolerance
 *
 * For any valid payload, shuffling its frame list into any order and inserting
 * arbitrary duplicates before feeding to the Reassembler produces the same
 * payload as feeding them in the original order.
 *
 * Tests Requirements 5.6, 5.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R3.order-independent (Property 5: Order-independence and duplicate-tolerance)', () => {
  it('should reassemble to same payload regardless of frame order and duplicates', () => {
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
        fc.array(fc.nat(), { minLength: 20, maxLength: 20 }),
        fc.array(fc.nat(), { maxLength: 10 }),
        (
          payload: Uint8Array,
          keys: number[],
          dups: number[]
        ): boolean => {
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
            return true;
          }

          // Build order: indices 0..frames.length-1 sorted by (keys[i % 20], then i)
          const order: number[] = Array.from(
            { length: frames.length },
            (_, i) => i
          ).sort((i, j) => {
            const keyI = keys[i % 20]!;
            const keyJ = keys[j % 20]!;
            if (keyI !== keyJ) {
              return keyI - keyJ;
            }
            return i - j;
          });

          // Append dups: map each dup to d % frames.length and add to order
          const finalOrder: number[] = [...order];
          for (const d of dups) {
            finalOrder.push(d % frames.length);
          }

          // Feed every frame in that order
          const reassembler = createReassembler();
          let completeResult: ReturnType<typeof reassembler.feed> | null = null;

          for (const frameIdx of finalOrder) {
            const frameBytes = frames[frameIdx]!;
            const decoded = decodeFrame(frameBytes);
            if (decoded === null) {
              return false;
            }

            const result = reassembler.feed(decoded);
            if (result.status === 'complete' && completeResult === null) {
              completeResult = result;
            }
          }

          // Record the FIRST 'complete' result and assert it exists
          if (completeResult === null) {
            return false;
          }

          if (completeResult.status !== 'complete') {
            return false;
          }

          // Assert payload equals original byte for byte
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
