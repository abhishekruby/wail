/**
 * GgwaveModem: production implementation of the Modem interface using ggwave WASM.
 *
 * Encodes frames as audio waveforms via ggwave and decodes received samples back to frames.
 * Created once per session via async factory, then reused for the entire send/receive cycle.
 *
 * WASM memory discipline: every output from ggwave is a view into WASM linear memory and
 * MUST be copied to a new Uint8Array or Int8Array before the next ggwave call. If not copied,
 * the view's bytes will be overwritten by ggwave with new data, causing silent data corruption.
 */

import type { GgwaveInstance, GgwaveProtocol, Ggwave } from 'ggwave';
import factory from 'ggwave';
import { Modem, EncodeAudioResult } from './modem.js';
import { MAX_FRAME } from '../protocol/constants.js';

/**
 * Configuration for GgwaveModem.
 *
 * @property sampleRate - PCM sample rate (e.g., 48,000 or 44,100 Hz). Positive integer.
 * @property speed - Modulation speed: 'normal' or 'fast'. Maps to ggwave protocol IDs.
 * @property volume - Amplitude scaling: integer in [1, 100]. Default is 10.
 */
export interface GgwaveModemConfig {
  sampleRate: number;
  speed: 'normal' | 'fast';
  volume: number;
}

/**
 * GgwaveModem: production modem using ggwave WASM.
 *
 * Created via async factory: `const modem = await GgwaveModem.create(config)`.
 * Reused for the entire session; do not create a new instance per message or repeat.
 */
export class GgwaveModem implements Modem {
  private gg: Ggwave;
  private inst: GgwaveInstance;
  private config: GgwaveModemConfig;
  private protocolId: GgwaveProtocol;
  private chunkBytes: number;
  private pending: Int8Array;

  /**
   * Static async factory for creating a GgwaveModem instance.
   *
   * Loads ggwave WASM, validates configuration, initializes the codec, and returns
   * a ready-to-use modem instance. This factory is async because the ggwave WASM
   * module is loaded asynchronously.
   *
   * @param config - GgwaveModemConfig with sampleRate, speed, and volume.
   * @returns A new GgwaveModem instance, or throws if configuration is invalid.
   * @throws If sampleRate <= 0, speed is invalid, or volume is out of range.
   */
  static async create(config: GgwaveModemConfig): Promise<GgwaveModem> {
    // Validate configuration
    if (config.sampleRate <= 0) {
      throw new Error('Invalid sampleRate: must be positive');
    }
    if (config.speed !== 'normal' && config.speed !== 'fast') {
      throw new Error('Invalid speed: must be "normal" or "fast"');
    }
    if (!Number.isInteger(config.volume) || config.volume < 1 || config.volume > 100) {
      throw new Error('Invalid volume: must be an integer in [1, 100]');
    }

    // Load ggwave WASM module
    const gg = await factory();
    gg.disableLog();

    // Get default parameters and set sample rates
    const p = gg.getDefaultParameters();
    p.sampleRateInp = config.sampleRate;
    p.sampleRateOut = config.sampleRate;

    // Map speed to protocol ID
    const protocolId =
      config.speed === 'normal'
        ? gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL
        : gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST;

    // Create ggwave instance
    const inst = gg.init(p);

    // Calculate chunk size: samplesPerFrame samples at 4 bytes per sample (Float32)
    const samplesPerFrame = p.samplesPerFrame;
    const chunkBytes = samplesPerFrame * 4;

    // Return a new GgwaveModem instance with the loaded ggwave module and configuration
    return new GgwaveModem(gg, inst, config, protocolId, chunkBytes);
  }

  /**
   * Private constructor: use the async factory instead.
   *
   * @param gg - The loaded ggwave WASM module.
   * @param inst - The initialized ggwave codec instance.
   * @param config - The modem configuration.
   * @param protocolId - The protocol ID (computed from speed).
   * @param chunkBytes - The chunk size in bytes (samplesPerFrame * 4).
   */
  private constructor(
    gg: Ggwave,
    inst: GgwaveInstance,
    config: GgwaveModemConfig,
    protocolId: GgwaveProtocol,
    chunkBytes: number,
  ) {
    this.gg = gg;
    this.inst = inst;
    this.config = config;
    this.protocolId = protocolId;
    this.chunkBytes = chunkBytes;
    this.pending = new Int8Array(0);
  }

  /**
   * Encode a frame into a playable audio waveform.
   *
   * Calls ggwave's encode, copies the result out of WASM memory, and reinterprets the bytes
   * as a Float32Array (bit-reinterpretation, not numeric conversion).
   *
   * @param frame - A Uint8Array of 1–128 bytes.
   * @returns { ok: true; samples: Float32Array } with amplitude in [−1, +1] on success.
   * @returns { ok: false; error: 'empty-frame' | 'frame-too-large' } on error.
   */
  encode(frame: Uint8Array): EncodeAudioResult {
    // Validate frame size
    if (frame.length < 1) {
      return { ok: false, error: 'empty-frame' };
    }
    if (frame.length > MAX_FRAME) {
      return { ok: false, error: 'frame-too-large' };
    }

    // Encode the frame via ggwave
    // ggwave returns an Int8Array view into WASM linear memory, containing 32-bit float
    // samples encoded as bytes (the IEEE 754 bit representation, not numeric division).
    const result = this.gg.encode(this.inst, frame, this.protocolId, this.config.volume);

    // WASM memory discipline: copy the result immediately before the next ggwave call.
    // If we do not copy and ggwave is called again, the original view will contain corrupted data.
    const copy = new Int8Array(result);

    // Reinterpret the Int8 bytes as Float32 (bit-reinterpretation, not numeric conversion).
    // This reconstructs the original 32-bit float values from their IEEE 754 byte representation.
    const float32 = new Float32Array(copy.buffer);

    return { ok: true, samples: float32 };
  }

  /**
   * Decode received audio samples back into frames.
   *
   * ggwave's decode() only works when fed exactly samplesPerFrame samples (1024 samples =
   * 4096 bytes at 48 kHz). This method handles variable block sizes by buffering incomplete
   * blocks and feeding ggwave only when we have enough bytes for a complete chunk.
   *
   * Reinterprets Float32 samples as Int8 bytes, appends to the pending buffer, then feeds
   * complete chunks to ggwave and collects decoded frames. Handles multi-block frame
   * reassembly by looping until ggwave has no more complete frames.
   *
   * @param samples - A Float32Array of received PCM audio (amplitude [−1, +1]).
   * @returns An array of decoded Uint8Array frames (zero or more).
   */
  feed(samples: Float32Array): Uint8Array[] {
    // Reinterpret Float32 samples as an Int8 byte view.
    // This is a bit-reinterpretation, not a numeric conversion: the bytes of the Float32
    // representation are read as Int8 (possibly as negative values in the range [−128, +127]).
    const int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);

    // Append new samples to pending buffer
    if (int8View.length > 0) {
      const combined = new Int8Array(this.pending.length + int8View.length);
      combined.set(this.pending, 0);
      combined.set(int8View, this.pending.length);
      this.pending = combined;
    }

    const frames: Uint8Array[] = [];

    // Feed complete chunks to ggwave
    while (this.pending.length >= this.chunkBytes) {
      const chunk = this.pending.subarray(0, this.chunkBytes);

      // Decode the chunk exactly once. If a frame is complete, ggwave returns it;
      // otherwise, it returns empty.
      const result = this.gg.decode(this.inst, chunk);

      // If a frame was decoded, copy it and add to frames.
      // WASM memory discipline: copy the result immediately before the next ggwave call.
      if (result && result.length > 0) {
        const decoded = new Uint8Array(result);
        frames.push(decoded);
      }

      // Remove the processed chunk from pending
      this.pending = this.pending.slice(this.chunkBytes);
    }

    return frames;
  }

  /**
   * Reset the internal pending buffer.
   *
   * Clears any partially-buffered samples. Useful for cleaning up between messages or
   * when the signal is lost and you want to start fresh.
   */
  reset(): void {
    this.pending = new Int8Array(0);
  }
}
