/**
 * Noise resilience test: GgwaveModem at FAST speed with white noise.
 *
 * Tests that GgwaveModem (FAST speed, volume 10, 48000 Hz) decodes 10/10 times
 * at +10 dB SNR and 0 dB SNR with 64-byte frames and seeded Gaussian noise.
 *
 * Uses Box-Muller transform with a seeded PRNG (mulberry32) to generate deterministic
 * Gaussian noise.
 *
 * Validates:
 * - Requirements 2.5 (oversize rejection), 5.1, 5.2 (error handling)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GgwaveModem } from '../../src/modem/ggwave-modem.js';

let modem: GgwaveModem;

beforeAll(async () => {
  modem = await GgwaveModem.create({
    sampleRate: 48000,
    speed: 'fast',
    volume: 10,
  });
});

/**
 * Seeded PRNG (mulberry32).
 * Generates deterministic pseudo-random numbers in [0, 1).
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate Gaussian random variable using Box-Muller transform.
 */
function boxMuller(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return r * Math.cos(theta);
}

/**
 * Measure RMS (root mean square) of a signal.
 * Only considers samples with absolute value > 1e-4 to avoid measuring silence.
 */
function measureRms(signal: Float32Array): number {
  let sumSquares = 0;
  let count = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const sample = signal[i]!;
    if (Math.abs(sample) > 1e-4) {
      sumSquares += sample * sample;
      count += 1;
    }
  }
  return count > 0 ? Math.sqrt(sumSquares / count) : 0;
}

describe('Noise resilience', () => {
  it(
    'decodes 10/10 times at +10 dB SNR with 64-byte frames',
    () => {
      const rng = mulberry32(0x12345678); // seeded PRNG
      const frame = new Uint8Array(64);
      for (let i = 0; i < frame.length; i += 1) {
        frame[i] = i % 256;
      }

      let successCount = 0;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const encoded = modem.encode(frame);
        expect(encoded.ok).toBe(true);

        if (encoded.ok) {
          const signal = encoded.samples;
          const signalRms = measureRms(signal);

          // Add Gaussian noise at +10 dB SNR
          // SNR = 10 * log10(signalRms^2 / noiseRms^2)
          // 10 = 10 * log10(signalRms^2 / noiseRms^2)
          // 1 = log10(signalRms^2 / noiseRms^2)
          // 10 = signalRms^2 / noiseRms^2
          // noiseRms = signalRms / sqrt(10)
          const noiseRms = signalRms / Math.sqrt(10);

          const noisy = new Float32Array(signal.length);
          for (let i = 0; i < signal.length; i += 1) {
            const noise = boxMuller(rng) * noiseRms;
            noisy[i] = signal[i]! + noise;
          }

          const decoded = modem.feed(noisy);
          if (decoded.length === 1 && decoded[0]!.every((b, i) => b === frame[i])) {
            successCount += 1;
          }
        }
      }

      expect(successCount).toBe(10);
    },
    60000,
  );

  it(
    'decodes 10/10 times at 0 dB SNR with 64-byte frames',
    () => {
      const rng = mulberry32(0x87654321); // different seed
      const frame = new Uint8Array(64);
      for (let i = 0; i < frame.length; i += 1) {
        frame[i] = (i * 7) % 256; // different pattern
      }

      let successCount = 0;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const encoded = modem.encode(frame);
        expect(encoded.ok).toBe(true);

        if (encoded.ok) {
          const signal = encoded.samples;
          const signalRms = measureRms(signal);

          // Add Gaussian noise at 0 dB SNR
          // 0 = 10 * log10(signalRms^2 / noiseRms^2)
          // 0 = log10(signalRms^2 / noiseRms^2)
          // 1 = signalRms^2 / noiseRms^2
          // noiseRms = signalRms
          const noiseRms = signalRms;

          const noisy = new Float32Array(signal.length);
          for (let i = 0; i < signal.length; i += 1) {
            const noise = boxMuller(rng) * noiseRms;
            noisy[i] = signal[i]! + noise;
          }

          const decoded = modem.feed(noisy);
          if (decoded.length === 1 && decoded[0]!.every((b, i) => b === frame[i])) {
            successCount += 1;
          }
        }
      }

      expect(successCount).toBe(10);
    },
    60000,
  );
});
