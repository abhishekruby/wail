/**
 * Property 7: CRC-32 flip rejection
 *
 * For any reassembled payload with exactly one byte flipped at any position,
 * the Reassembler returns { status: 'crc-fail' } and no bytes are exposed.
 *
 * The corrupted case is built by changing one byte of a data frame body
 * AFTER decodeFrame (so it passes CRC-16) and expecting status 'crc-fail'.
 *
 * Tests Requirements 6.4, 6.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R3.crc32-flip (Property 7: CRC-32 flip rejection)', () => {
  it('should reject payload with one byte flipped via crc-fail', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 2048 }),
        fc.integer({ min: 0 }), // frame index
        fc.integer({ min: 0 }), // byte offset within frame body
        fc.integer({ min: 1, max: 255 }), // XOR mask (non-zero to ensure flip)
        (payload: Uint8Array, frameIndexRaw: number, byteOffsetRaw: number, xorMask: number) => {
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

          // Decode all frames to build a parallel list of decoded frames
          const decodedFrames = frames.map((f) => {
            const decoded = decodeFrame(f);
            return decoded;
          });

          if (decodedFrames.some((f) => f === null)) {
            return false; // Should not happen with valid encoded frames
          }

          const decoded = decodedFrames as NonNullable<typeof decodedFrames[number]>[];

          // Find a data frame (type === 1) to corrupt
          const dataFrameIndices = decoded.map((f, i) => f.type === 1 ? i : -1).filter(i => i >= 0);

          if (dataFrameIndices.length === 0) {
            // No data frames to corrupt (empty message)
            return true;
          }

          // Pick a data frame to corrupt
          const dataFrameIndex = dataFrameIndices[frameIndexRaw % dataFrameIndices.length]!;
          const targetFrame = decoded[dataFrameIndex]!;

          if (targetFrame.body.length === 0) {
            // Empty body, nothing to corrupt
            return true;
          }

          // Calculate the real payload length for this data frame
          // For data frame seq s, real length is min(120, payload.length - 120*(s-1))
          const frameSeq = targetFrame.seq;
          const realLength = Math.min(120, payload.length - 120 * (frameSeq - 1));

          // Pick a byte offset within the real payload bytes (not the padding)
          const byteOffset = byteOffsetRaw % realLength;

          // Corrupt that byte in the frame body
          const corruptedBody = new Uint8Array(targetFrame.body);
          corruptedBody[byteOffset] = corruptedBody[byteOffset]! ^ xorMask;

          // Now feed all frames to the reassembler, with the corrupted one
          const reassembler = createReassembler();
          let hadCrcFail = false;

          for (let i = 0; i < decoded.length; i++) {
            const frame = decoded[i]!;

            // If this is the frame to corrupt, use the corrupted body
            if (i === dataFrameIndex) {
              // Create a new decoded frame with the corrupted body
              const corruptedFrame = {
                ...frame,
                body: corruptedBody,
              };
              const result = reassembler.feed(corruptedFrame);
              if (result.status === 'crc-fail') {
                hadCrcFail = true;
              }
            } else {
              const result = reassembler.feed(frame);
              if (result.status === 'crc-fail') {
                hadCrcFail = true;
              }
            }
          }

          // Should have gotten crc-fail
          return hadCrcFail;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
