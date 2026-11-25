/**
 * Property test: Multi-block feed assembly with 3-frame broadcast stream.
 *
 * Property 3 from requirements: for any 3-frame broadcast stream with realistic frames,
 * splitting the encoded waveform into random-sized blocks (64 to 4,096 samples each) and
 * calling feed() sequentially with each block produces the same 3 decoded frames in order.
 *
 * Uses realistic frames built with whitening (via buildFrame) to avoid ggwave's known
 * weakness on low-entropy payloads. Separates the 3 frames with silence (0.3 s at 48 kHz =
 * 14,400 samples) as real broadcasts do.
 *
 * Validates:
 * - Requirements 1.4 (frames from multiple blocks), 1.3 (variable block sizes),
 *   2.3 (feed multi-block), 6.1 (WASM memory discipline)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GgwaveModem } from '../../src/modem/ggwave-modem.js';
import { buildFrame } from '../../src/protocol/frame-encoder.js';

describe('Multi-block feed assembly (3-frame broadcast stream)', () => {
  it(
    'encodes 3 realistic frames with silence gaps, splits into random blocks, feeds with fresh modem per run, decodes all 3 in order',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: 64, max: 4096 }),
            fc.constant(128),
          ),
          fc.uint8Array({ minLength: 0, maxLength: 120 }),
          fc.uint8Array({ minLength: 0, maxLength: 120 }),
          fc.uint8Array({ minLength: 0, maxLength: 120 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          async (
            blockSize: number,
            body1: Uint8Array,
            body2: Uint8Array,
            body3: Uint8Array,
            salt1: number,
            salt2: number,
            salt3: number,
          ) => {
            // Create a fresh modem per run
            const modem = await GgwaveModem.create({
              sampleRate: 48000,
              speed: 'fast',
              volume: 10,
            });

            // Build 3 realistic frames with random bodies and sequential seq numbers
            const frame1Result = buildFrame(
              {
                type: 1,
                messageId: 1,
                seq: 1,
                body: body1,
              },
              { rng: () => salt1 },
            );
            const frame2Result = buildFrame(
              {
                type: 1,
                messageId: 1,
                seq: 2,
                body: body2,
              },
              { rng: () => salt2 },
            );
            const frame3Result = buildFrame(
              {
                type: 1,
                messageId: 1,
                seq: 3,
                body: body3,
              },
              { rng: () => salt3 },
            );

            expect(frame1Result.ok && frame2Result.ok && frame3Result.ok).toBe(true);
            if (!frame1Result.ok || !frame2Result.ok || !frame3Result.ok) return;

            // Encode all 3 frames
            const encoded1 = modem.encode(frame1Result.frame);
            const encoded2 = modem.encode(frame2Result.frame);
            const encoded3 = modem.encode(frame3Result.frame);

            expect(encoded1.ok && encoded2.ok && encoded3.ok).toBe(true);
            if (!encoded1.ok || !encoded2.ok || !encoded3.ok) return;

            // Build the broadcast stream: frame1, silence, frame2, silence, frame3, silence
            const silence = new Float32Array(14400); // 0.3 s at 48 kHz
            const streamLength =
              encoded1.samples.length + 14400 +
              encoded2.samples.length + 14400 +
              encoded3.samples.length + 14400;

            const stream = new Float32Array(streamLength);
            let offset = 0;

            stream.set(encoded1.samples, offset);
            offset += encoded1.samples.length;
            stream.set(silence, offset);
            offset += 14400;

            stream.set(encoded2.samples, offset);
            offset += encoded2.samples.length;
            stream.set(silence, offset);
            offset += 14400;

            stream.set(encoded3.samples, offset);
            offset += encoded3.samples.length;
            stream.set(silence, offset);

            // Feed the stream block by block into the modem
            const decodedFrames: Uint8Array[] = [];
            for (let i = 0; i < stream.length; i += blockSize) {
              const endIdx = Math.min(i + blockSize, stream.length);
              const block = stream.subarray(i, endIdx);
              const decoded = modem.feed(block);
              decodedFrames.push(...decoded);
            }

            // Expect exactly 3 frames in order, equal to the built frames
            expect(decodedFrames.length).toBe(3);
            expect(decodedFrames[0]!).toEqual(frame1Result.frame);
            expect(decodedFrames[1]!).toEqual(frame2Result.frame);
            expect(decodedFrames[2]!).toEqual(frame3Result.frame);
          },
        ),
        { numRuns: 10, timeout: 60000 },
      );
    },
    60000,
  );
});
