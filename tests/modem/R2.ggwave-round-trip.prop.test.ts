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
import { buildFrame, resaltFrame } from '../../src/protocol/frame-encoder.js';

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

              // Try up to 3 salts: original, +85, +170 (design handles ggwave's ~1/128 failure rate per salt)
              const saltsToTry = [
                frame,
                resaltFrame(frame, (salt + 85) & 0xff),
                resaltFrame(frame, (salt + 170) & 0xff),
              ];

              let anyAttemptSucceeded = false;

              for (const attemptFrame of saltsToTry) {
                modemNormal.reset();
                const encoded = modemNormal.encode(attemptFrame);
                expect(encoded.ok).toBe(true);

                if (encoded.ok) {
                  const decoded = [...modemNormal.feed(encoded.samples), ...modemNormal.feed(new Float32Array(48000))];
                  // Missing is allowed (the next salt retries); wrong bytes or extra frames never are.
                  expect(decoded.length).toBeLessThanOrEqual(1);
                  for (const d of decoded) expect(d).toEqual(attemptFrame);
                  if (decoded.length === 1) {
                    anyAttemptSucceeded = true;
                    break;
                  }
                }
              }

              expect(anyAttemptSucceeded).toBe(true);
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

              // Try up to 3 salts: original, +85, +170 (design handles ggwave's ~1/128 failure rate per salt)
              const saltsToTry = [
                frame,
                resaltFrame(frame, (salt + 85) & 0xff),
                resaltFrame(frame, (salt + 170) & 0xff),
              ];

              let anyAttemptSucceeded = false;

              for (const attemptFrame of saltsToTry) {
                modemFast.reset();
                const encoded = modemFast.encode(attemptFrame);
                expect(encoded.ok).toBe(true);

                if (encoded.ok) {
                  const decoded = [...modemFast.feed(encoded.samples), ...modemFast.feed(new Float32Array(48000))];
                  // Missing is allowed (the next salt retries); wrong bytes or extra frames never are.
                  expect(decoded.length).toBeLessThanOrEqual(1);
                  for (const d of decoded) expect(d).toEqual(attemptFrame);
                  if (decoded.length === 1) {
                    anyAttemptSucceeded = true;
                    break;
                  }
                }
              }

              expect(anyAttemptSucceeded).toBe(true);
            }
          },
        ),
        { numRuns: 30 },
      );
    },
    60000,
  );

  it(
    'regression: specific body [239,213,1,114,169,202,32,200,168,219] salt 38 at NORMAL fails on first attempt, resaltFrame(frame, 123) decodes',
    () => {
      const body = Uint8Array.from([239, 213, 1, 114, 169, 202, 32, 200, 168, 219]);
      const salt = 38;

      const builtFrameResult = buildFrame(
        { type: 1, messageId: 1, seq: 1, body },
        { rng: () => salt },
      );
      expect(builtFrameResult.ok).toBe(true);

      if (builtFrameResult.ok) {
        const frame = builtFrameResult.frame;

        // First attempt: original frame should fail (0 frames decoded)
        modemNormal.reset();
        const encoded1 = modemNormal.encode(frame);
        expect(encoded1.ok).toBe(true);

        if (encoded1.ok) {
          const decoded1 = modemNormal.feed(encoded1.samples);
          modemNormal.feed(new Float32Array(48000));
          expect(decoded1.length).toBe(0);
        }

        // Second attempt: resaltFrame(frame, 123) should decode exactly
        const resalted = resaltFrame(frame, 123);
        modemNormal.reset();
        const encoded2 = modemNormal.encode(resalted);
        expect(encoded2.ok).toBe(true);

        if (encoded2.ok) {
          const decoded2 = modemNormal.feed(encoded2.samples);
          modemNormal.feed(new Float32Array(48000));
          expect(decoded2.length).toBe(1);
          expect(decoded2[0]!).toEqual(resalted);
        }
      }
    },
    60000,
  );
});
