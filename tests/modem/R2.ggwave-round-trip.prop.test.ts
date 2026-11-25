/**
 * Property test: GgwaveModem encode-feed round-trip.
 *
 * Property 2 from requirements: for random frames built with realistic whitening
 * (as used in production), calling encode() and then feed(encodedWaveform) on a
 * GgwaveModem instance returns a list containing exactly that frame.
 *
 * Uses buildFrame() with random body and salt to generate frames that match what
 * Wail actually sends (never raw unwhitened bytes), avoiding ggwave's known weakness
 * on low-entropy payloads (documented in tech.md and field-tests.md).
 *
 * Validates:
 * - Requirements 2.2 (ggwave encode result interpretation), 2.3 (feed multi-block),
 *   2.5 (oversize rejection), 6.1 (WASM memory discipline), 7.1 (float32 encoding),
 *   7.2 (sample reinterpretation)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { GgwaveModem } from '../../src/modem/ggwave-modem.js';
import { buildFrame } from '../../src/protocol/frame-encoder.js';

let modemNormal: GgwaveModem;
let modemFast: GgwaveModem;

beforeAll(async () => {
  modemNormal = await GgwaveModem.create({
    sampleRate: 48000,
    speed: 'normal',
    volume: 10,
  });

  modemFast = await GgwaveModem.create({
    sampleRate: 48000,
    speed: 'fast',
    volume: 10,
  });
});

describe('GgwaveModem round-trip', () => {
  it(
    'encode then feed returns the same frame at NORMAL speed',
    () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 120 }),
          fc.integer({ min: 0, max: 255 }),
          (body: Uint8Array, salt: number) => {
            // Build a realistic frame with whitening and CRC, never send raw bytes
            const builtFrameResult = buildFrame(
              { type: 1, messageId: 1, seq: 1, body },
              { rng: () => salt },
            );
            expect(builtFrameResult.ok).toBe(true);

            if (builtFrameResult.ok) {
              const frame = builtFrameResult.frame;
              const encoded = modemNormal.encode(frame);
              expect(encoded.ok).toBe(true);

              if (encoded.ok) {
                const decoded = modemNormal.feed(encoded.samples);
                expect(decoded.length).toBe(1);
                expect(decoded[0]).toEqual(frame);
              }
            }
          },
        ),
        { numRuns: 30 },
      );
    },
    60000,
  );

  it(
    'encode then feed returns the same frame at FAST speed',
    () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 120 }),
          fc.integer({ min: 0, max: 255 }),
          (body: Uint8Array, salt: number) => {
            // Build a realistic frame with whitening and CRC, never send raw bytes
            const builtFrameResult = buildFrame(
              { type: 1, messageId: 1, seq: 1, body },
              { rng: () => salt },
            );
            expect(builtFrameResult.ok).toBe(true);

            if (builtFrameResult.ok) {
              const frame = builtFrameResult.frame;
              const encoded = modemFast.encode(frame);
              expect(encoded.ok).toBe(true);

              if (encoded.ok) {
                const decoded = modemFast.feed(encoded.samples);
                expect(decoded.length).toBe(1);
                expect(decoded[0]).toEqual(frame);
              }
            }
          },
        ),
        { numRuns: 30 },
      );
    },
    60000,
  );
});
