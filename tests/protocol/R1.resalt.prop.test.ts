/**
 * Property 11: resaltFrame correctness
 *
 * For any valid frame and any newSalt value that differs from the frame's current salt (byte 0),
 * resaltFrame(frame, newSalt) produces a frame where:
 * (a) byte 0 equals newSalt, and
 * (b) decodeFrame(resaltFrame(frame, newSalt)) returns fields identical to decodeFrame(frame).
 *
 * Tests Requirements 2.5, 2.8
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildFrame, resaltFrame } from '../../src/protocol/frame-encoder.js';
import { decodeFrame } from '../../src/protocol/frame-decoder.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R1.resalt (Property 11: resaltFrame correctness)', () => {
  it('should produce identical decoded fields with a new salt', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 120 }),
        fc.integer({ min: 0, max: 65535 }), // messageId
        fc.integer({ min: 0, max: 255 }), // seq
        fc.integer({ min: 0, max: 255 }), // newSalt
        (body: Uint8Array, messageId: number, seq: number, newSalt: number) => {
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
            return true; // Skip if frame building failed
          }

          const originalFrame = result.frame;
          const originalSalt = originalFrame[0]!;

          // Skip if newSalt equals the original salt (we need a change)
          if (newSalt === originalSalt) {
            return true;
          }

          // Resalt the frame
          const resaltedFrame = resaltFrame(originalFrame, newSalt);

          // Check (a): byte 0 equals newSalt
          if (resaltedFrame[0] !== newSalt) {
            return false;
          }

          // Decode both frames
          const originalDecoded = decodeFrame(originalFrame);
          const resaltedDecoded = decodeFrame(resaltedFrame);

          // Both should decode successfully
          if (originalDecoded === null || resaltedDecoded === null) {
            return false;
          }

          // Check (b): decoded fields must be identical
          if (
            originalDecoded.magic !== resaltedDecoded.magic ||
            originalDecoded.version !== resaltedDecoded.version ||
            originalDecoded.type !== resaltedDecoded.type ||
            originalDecoded.messageId !== resaltedDecoded.messageId ||
            originalDecoded.seq !== resaltedDecoded.seq ||
            originalDecoded.body.length !== resaltedDecoded.body.length
          ) {
            return false;
          }

          // Check body bytes match
          for (let i = 0; i < originalDecoded.body.length; i++) {
            if (originalDecoded.body[i] !== resaltedDecoded.body[i]) {
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
