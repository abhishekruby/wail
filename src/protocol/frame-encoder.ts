/**
 * Frame encoder: builds wire-format frames from fields.
 *
 * Responsible for:
 * - Computing CRC-16 over un-whitened magic..body
 * - Whitening the region from magic through crc16
 * - Zero-padding the body to reach MIN_FRAME length
 * - Injecting a fresh salt for each frame transmission
 * - Re-whitening with a new salt for frame repeats
 */

import { MAX_FRAME, MIN_FRAME, MAGIC, VERSION } from './constants.js';
import { whiten } from './whiten.js';
import { crc16 } from './crc16.js';
import type { FrameFields, EncoderOptions, EncodeResult, RngSource } from './types.js';

/**
 * Default RNG using crypto.getRandomValues.
 * Returns one random byte (0–255) per call.
 */
function defaultRng(): number {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]!;
}

/**
 * Build one raw frame Uint8Array from the given fields.
 *
 * Layout: salt (1, clear) | whitened[ magic (1) | version+type (1) | message_id (2 LE) |
 *         seq (1) | body (zero-padded) | crc16 (2 LE) ]
 *
 * - Generates a fresh salt via rng()
 * - Zero-pads body so total frame >= MIN_FRAME
 * - Computes CRC-16 over un-whitened magic..body
 * - Whitens magic..crc16
 * - Returns an error if body > 120 bytes or resulting frame > MAX_FRAME
 */
export function buildFrame(fields: FrameFields, options?: EncoderOptions): EncodeResult {
  const rng = options?.rng ?? defaultRng;

  // Validate body size
  if (fields.body.length > 120) {
    return { ok: false, error: 'body-too-large' };
  }

  // Generate fresh salt
  const salt = rng() & 0xff;

  // Build un-whitened region: magic, version+type, message_id, seq, body
  const versionType = (VERSION << 4) | (fields.type & 0x0f);

  // Calculate total body size (after zero-padding to reach MIN_FRAME)
  // Frame layout: salt (1) + [magic (1) + version+type (1) + message_id (2) + seq (1) + body + crc16 (2)]
  // Minimum whitened region = 1 + 1 + 2 + 1 + 2 = 7 bytes (for manifest with no body)
  // So minimum frame = 1 (salt) + 7 = 8 bytes
  // We need MIN_FRAME total, so minimum whitened region = MIN_FRAME - 1 = 11 bytes
  const minWhitenedLen = MIN_FRAME - 1;
  const unwhitenedHeaderLen = 1 + 1 + 2 + 1; // magic + version+type + message_id + seq = 5 bytes
  const minBodyLen = minWhitenedLen - unwhitenedHeaderLen - 2; // -2 for crc16 = 11 - 5 - 2 = 4 bytes
  const bodyLen = Math.max(fields.body.length, minBodyLen);

  // Check if final frame would exceed MAX_FRAME
  const totalFrameLen = 1 + unwhitenedHeaderLen + bodyLen + 2; // salt + header + padded body + crc16
  if (totalFrameLen > MAX_FRAME) {
    return { ok: false, error: 'frame-too-large' };
  }

  // Build un-whitened region (before CRC computation)
  const unwhitened = new Uint8Array(unwhitenedHeaderLen + bodyLen);
  unwhitened[0] = MAGIC;
  unwhitened[1] = versionType;
  unwhitened[2] = fields.messageId & 0xff;
  unwhitened[3] = (fields.messageId >>> 8) & 0xff;
  unwhitened[4] = fields.seq & 0xff;

  // Copy body and zero-pad
  unwhitened.set(fields.body, unwhitenedHeaderLen);

  // Compute CRC-16 over un-whitened region (excluding the crc16 field itself)
  const crcValue = crc16(unwhitened);

  // Build the region to be whitened: unwhitened + crc16 (little-endian)
  const toWhiten = new Uint8Array(unwhitenedHeaderLen + bodyLen + 2);
  toWhiten.set(unwhitened);
  toWhiten[unwhitenedHeaderLen + bodyLen] = crcValue & 0xff;
  toWhiten[unwhitenedHeaderLen + bodyLen + 1] = (crcValue >>> 8) & 0xff;

  // Whiten the entire region
  const whitened = whiten(toWhiten, salt);

  // Build final frame: salt (clear) + whitened
  const frame = new Uint8Array(1 + whitened.length);
  frame[0] = salt;
  frame.set(whitened, 1);

  return { ok: true, frame };
}

/**
 * Re-whiten a frame with a new salt.
 *
 * Dewhitens the existing whitened region using the original salt (bytes[0]),
 * replaces salt at byte 0 with newSalt, then rewhitens the entire region
 * [1..end] with newSalt. Pure — returns a new Uint8Array; never mutates input.
 *
 * Used by the broadcast carousel: each repeat of a frame calls resaltFrame
 * with a salt different from the one used in the previous repeat, so a frame
 * that ggwave corrupts on one cycle gets an independent decode attempt on the next.
 */
export function resaltFrame(frame: Uint8Array, newSalt: number): Uint8Array {
  if (frame.length < 1) {
    return new Uint8Array(frame);
  }

  const oldSalt = frame[0]!;
  const whitenedRegion = frame.subarray(1);

  // Dewhiten with old salt to recover the un-whitened region
  const unwhitened = whiten(whitenedRegion, oldSalt);

  // Rewhiten with new salt
  const rewhitened = whiten(unwhitened, newSalt);

  // Build result: new salt + rewhitened region
  const result = new Uint8Array(1 + rewhitened.length);
  result[0] = newSalt & 0xff;
  result.set(rewhitened, 1);

  return result;
}
