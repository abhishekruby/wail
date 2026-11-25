/**
 * Modem interface: type-safe, implementation-agnostic abstraction over any modem
 * (ggwave or test double). Encodes frames as audio waveforms and decodes received
 * samples back to frames.
 *
 * Both encode and feed are synchronous (not async). They must complete immediately.
 */

/**
 * Result of encoding a frame into a playable audio waveform.
 *
 * Success case: { ok: true; samples: Float32Array } with amplitude in [−1, +1], ready for playback.
 * Failure cases:
 *   - { ok: false; error: 'frame-too-large' } if frame > MAX_FRAME (128 bytes)
 *   - { ok: false; error: 'empty-frame' } if frame is 0 bytes
 */
export type EncodeAudioResult =
  | { ok: true; samples: Float32Array }
  | { ok: false; error: 'frame-too-large' | 'empty-frame' };

/**
 * Modem: type-safe interface for encoding and decoding audio.
 *
 * Implementations: GgwaveModem (production, uses ggwave WASM) and PassthroughModem (test double).
 */
export interface Modem {
  /**
   * Encode a frame into a playable audio waveform.
   *
   * @param frame - A Uint8Array of 1–128 bytes.
   * @returns { ok: true; samples: Float32Array } with amplitude in [−1, +1] on success,
   *          or { ok: false; error: ... } if frame is out of range.
   *
   * Never throws for invalid input (errors are returned as error results).
   * Synchronous; completes immediately.
   */
  encode(frame: Uint8Array): EncodeAudioResult;

  /**
   * Decode received audio samples back into frames.
   *
   * Accepts any block size (64 to 4,096 samples or more). Buffers internally and returns
   * a list of decoded frames as they become complete. The caller does not need to know
   * the frame's air time; feed can be called with any chunk size.
   *
   * @param samples - A Float32Array of received PCM audio (amplitude [−1, +1]).
   * @returns An array of decoded Uint8Array frames (zero or more). Returns an empty list
   *          if no frame is complete yet or if decoding fails.
   *
   * Never throws for invalid input (returns an empty list instead).
   * Synchronous; completes immediately.
   */
  feed(samples: Float32Array): Uint8Array[];
}
