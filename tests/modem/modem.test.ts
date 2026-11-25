/**
 * Unit tests for the modem layer.
 *
 * Covers:
 * - PassthroughModem frame preservation (encode → feed round-trip)
 * - GgwaveModem basic functionality (error handling)
 * - Configuration validation
 */

import { describe, it, expect } from 'vitest';
import { PassthroughModem } from '../../src/modem/passthrough-modem.js';
import { validateModemConfig, DEFAULT_MODEM_CONFIG } from '../../src/modem/modem-config.js';

describe('PassthroughModem', () => {
  it('encode with valid frame returns ok: true with Float32 samples', () => {
    const modem = new PassthroughModem();
    const frame = new Uint8Array([1, 2, 3]);
    const result = modem.encode(frame);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.samples).toBeInstanceOf(Float32Array);
      expect(result.samples.length).toBe(3);
      // Sample i = byte i / 255
      expect(result.samples[0]).toBeCloseTo(1 / 255);
      expect(result.samples[1]).toBeCloseTo(2 / 255);
      expect(result.samples[2]).toBeCloseTo(3 / 255);
    }
  });

  it('encode with empty frame returns error: empty-frame', () => {
    const modem = new PassthroughModem();
    const frame = new Uint8Array([]);
    const result = modem.encode(frame);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('empty-frame');
    }
  });

  it('encode with oversized frame returns error: frame-too-large', () => {
    const modem = new PassthroughModem();
    const frame = new Uint8Array(129); // MAX_FRAME is 128
    const result = modem.encode(frame);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('frame-too-large');
    }
  });

  it('feed with invalid frame bytes returns empty list', () => {
    const modem = new PassthroughModem();
    // Create samples that don't decode to a valid protocol frame
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const decoded = modem.feed(samples);

    expect(decoded).toEqual([]);
  });
});

describe('Configuration validation', () => {
  it('validateModemConfig with valid config returns ok: true', () => {
    const config = { speed: 'normal' as const, volume: 50, sampleRate: 48000 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(true);
  });

  it('validateModemConfig with invalid speed returns error', () => {
    const config = { speed: 'invalid' as never, volume: 50, sampleRate: 48000 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-speed');
    }
  });

  it('validateModemConfig with invalid volume (too low) returns error', () => {
    const config = { speed: 'normal' as const, volume: 0, sampleRate: 48000 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-volume');
    }
  });

  it('validateModemConfig with invalid volume (too high) returns error', () => {
    const config = { speed: 'normal' as const, volume: 101, sampleRate: 48000 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-volume');
    }
  });

  it('validateModemConfig with non-integer volume returns error', () => {
    const config = { speed: 'normal' as const, volume: 50.5, sampleRate: 48000 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-volume');
    }
  });

  it('validateModemConfig with invalid sample rate (zero) returns error', () => {
    const config = { speed: 'normal' as const, volume: 50, sampleRate: 0 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-sample-rate');
    }
  });

  it('validateModemConfig with invalid sample rate (negative) returns error', () => {
    const config = { speed: 'normal' as const, volume: 50, sampleRate: -1 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-sample-rate');
    }
  });

  it('validateModemConfig with non-integer sample rate returns error', () => {
    const config = { speed: 'normal' as const, volume: 50, sampleRate: 48000.5 };
    const result = validateModemConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-sample-rate');
    }
  });

  it('DEFAULT_MODEM_CONFIG is valid', () => {
    const result = validateModemConfig(DEFAULT_MODEM_CONFIG);
    expect(result.ok).toBe(true);
  });

  it('DEFAULT_MODEM_CONFIG has speed fast', () => {
    expect(DEFAULT_MODEM_CONFIG.speed).toBe('fast');
  });

  it('DEFAULT_MODEM_CONFIG has volume 10', () => {
    expect(DEFAULT_MODEM_CONFIG.volume).toBe(10);
  });

  it('DEFAULT_MODEM_CONFIG has sample rate 48000', () => {
    expect(DEFAULT_MODEM_CONFIG.sampleRate).toBe(48000);
  });
});
