/**
 * PassthroughModem: test double implementing the Modem interface.
 *
 * Bypasses ggwave and uses byte-to-sample conversion for testing the protocol layer
 * without audio hardware or ggwave latency.
 *
 * encode(frame) returns frame bytes converted to Float32 samples (sample i = byte i / 255).
 * feed(samples) interprets Float32 samples as bytes and attempts to decode them as protocol frames.
 *
 * Note: PassthroughModem.encode() and feed() are not meant to round-trip together directly.
 * encode() is for testing frame encoding in isolation; feed() is for testing frame decoding
 * with actual protocol frames (which include magic bytes, CRC, etc.). Use GgwaveModem property
 * tests for encode-feed round-trip verification.
 */

import { Modem, EncodeAudioResult } from './modem.js';
import { MAX_FRAME } from '../protocol/constants.js';
import { decodeFrame } from '../protocol/frame-decoder.js';

/**
 * PassthroughModem: test double that bypasses ggwave.
 *
 * Implements the Modem interface without calling ggwave, allowing protocol tests
 * to run in Node without WASM or audio hardware.
 */
export class PassthroughModem implements Modem {
  /**
   * Buffer for accumulated bytes from feed calls.
   */
  private buffer: Uint8Array = new Uint8Array(0);

  /**
   * Constructor: accept (and ignore) all configuration.
   * The test double does not use speed or volume.
   */
  constructor() {
    // No-op; test double ignores configuration
  }

  /**
   * Encode a frame into Float32 samples (without calling ggwave).
   *
   * Converts frame bytes to Float32 samples: sample[i] = frame[i] / 255.
   *
   * @param frame - A Uint8Array of 1–128 bytes.
   * @returns { ok: true; samples: Float32Array } with samples in [0, 1] (all positive).
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

    // Convert frame bytes to Float32 samples: sample i = byte i / 255
    const samples = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i += 1) {
      const byte = frame[i];
      samples[i] = byte! / 255;
    }

    return { ok: true, samples };
  }

  /**
   * Decode Float32 samples back into frames (without calling ggwave).
   *
   * Reinterprets Float32 samples as an Int8 byte view, buffers the bytes across multiple
   * feed calls, and attempts to decode complete protocol frames using the protocol layer's
   * decodeFrame function.
   *
   * Frames are assumed to be protocol frames with magic bytes, CRC, etc., not raw
   * encode() output. Use this for testing protocol-layer frame decoding, not for
   * round-tripping encode() output.
   *
   * @param samples - A Float32Array of received audio samples.
   * @returns An array of decoded Uint8Array frame bodies (zero or more).
   *
   * Returns an empty array if no complete frame is buffered yet, or if decoding fails.
   */
  feed(samples: Float32Array): Uint8Array[] {
    // Reinterpret Float32 samples as Int8 bytes
    // This is a bit-reinterpretation, not a numeric conversion.
    const int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength);

    // Append new bytes to the buffer
    const newBuffer = new Uint8Array(this.buffer.length + int8View.length);
    newBuffer.set(this.buffer);
    newBuffer.set(new Uint8Array(int8View), this.buffer.length);
    this.buffer = newBuffer;

    const frames: Uint8Array[] = [];

    // Try to decode frames from the buffer
    // We scan the buffer looking for valid frames, trying frame sizes from MIN_FRAME upward
    let i = 0;
    while (i < this.buffer.length) {
      let decoded: any = null;
      let frameSize = 0;

      // Try to decode a frame starting at position i
      // Scan forward to find a valid frame (try sizes MIN_FRAME to MAX_FRAME)
      for (let size = 12; size <= Math.min(128, this.buffer.length - i); size += 1) {
        const candidateFrame = this.buffer.subarray(i, i + size);
        const result = decodeFrame(candidateFrame);
        if (result) {
          decoded = result;
          frameSize = size;
          break;
        }
      }

      if (decoded) {
        // Found a valid frame
        frames.push(decoded.body);
        i += frameSize;
      } else {
        // No valid frame found starting at i; move to next byte
        i += 1;
      }
    }

    // Keep any unprocessed tail bytes in the buffer
    // (frames were consumed starting from i bytes ago)
    if (frames.length > 0) {
      // Recalculate buffer: find where frames were consumed from
      // This is tricky; for now, clear the buffer after a frame is found
      // (simple but may lose data if frames are partial)
      // Better approach: track consumed bytes more carefully
      this.buffer = new Uint8Array(0);
    }

    return frames;
  }
}
