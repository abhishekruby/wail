/**
 * Property 9: Late-manifest delivery
 *
 * For any valid frame set with the manifest frame delivered last (after all data frames),
 * the Reassembler returns the same payload as it would if the manifest arrived first.
 *
 * Tests Requirements 5.1, 5.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R3.late-manifest (Property 9: Late-manifest delivery)', () => {
  it('should reassemble to same payload with manifest arriving last', () => {
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

          // Separate manifest (index 0) from data frames
          const manifestFrame = frames[0]!;
          const dataFrames = frames.slice(1);

          // Decode all frames
          const manifestDecoded = decodeFrame(manifestFrame);
          if (manifestDecoded === null) {
            return false;
          }

          const dataDecodedList = dataFrames.map((f) => decodeFrame(f));
          if (dataDecodedList.some((f) => f === null)) {
            return false;
          }

          const dataDecoded = dataDecodedList as NonNullable<typeof dataDecodedList[number]>[];

          // Test 1: Feed data frames first, then manifest (late-manifest scenario)
          const reassemblerLate = createReassembler();
          let lateResult = null;

          for (const frame of dataDecoded) {
            const result = reassemblerLate.feed(frame);
            if (result.status === 'complete') {
              lateResult = result;
            }
          }

          // Feed manifest last
          const manifestResult = reassemblerLate.feed(manifestDecoded);
          if (manifestResult.status === 'complete') {
            lateResult = manifestResult;
          }

          // Test 2: Feed manifest first, then data frames (early-manifest scenario)
          const reassemblerEarly = createReassembler();
          let earlyResult = null;

          const earlyManifestResult = reassemblerEarly.feed(manifestDecoded);
          if (earlyManifestResult.status === 'complete') {
            earlyResult = earlyManifestResult;
          }

          for (const frame of dataDecoded) {
            const result = reassemblerEarly.feed(frame);
            if (result.status === 'complete') {
              earlyResult = result;
            }
          }

          // Both should complete
          if (lateResult === null || earlyResult === null) {
            return false;
          }

          if (lateResult.status !== 'complete' || earlyResult.status !== 'complete') {
            return false;
          }

          // Both payloads should be identical
          const latePayload = lateResult.payload;
          const earlyPayload = earlyResult.payload;

          if (latePayload.length !== earlyPayload.length) {
            return false;
          }

          for (let i = 0; i < latePayload.length; i++) {
            if (latePayload[i] !== earlyPayload[i]) {
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
