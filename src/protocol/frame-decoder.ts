/**
 * Frame decoder: validates and strips the outer envelope of received frames.
 *
 * Responsible for:
 * - Dewhitening with the per-frame salt
 * - Verifying CRC-16 over the dewhitened region
 * - Validating frame structure (magic byte, version, type)
 * - Enforcing frame-type constraints (manifest seq must be 0, data seq must be >= 1)
 * - Returning null for any invalid frame (silent drop)
 */

import { MAX_FRAME, MIN_FRAME, MAGIC, VERSION, FRAME_TYPE_MANIFEST, FRAME_TYPE_DATA } from './constants.js';
import { whiten } from './whiten.js';
import { crc16 } from './crc16.js';
import type { DecodedFrame, ManifestFrame, DataFrame, RepairRequestFrame } from './types.js';

/**
 * Parse and validate a raw frame byte array.
 *
 * Returns null (silently) on any of:
 *   - length < MIN_FRAME or > MAX_FRAME
 *   - CRC-16 mismatch after dewhitening
 *   - magic byte != 0x57 after dewhitening
 *   - version nibble != 1
 *   - type nibble not in {0, 1, 2}
 *   - type is 0 (manifest) but seq is not 0
 *   - type is 1 (data) but seq is 0
 */
export function decodeFrame(bytes: Uint8Array): DecodedFrame | null {
  // Reject if outside size bounds
  if (bytes.length < MIN_FRAME || bytes.length > MAX_FRAME) {
    return null;
  }

  // Extract salt from byte 0 (clear, not whitened)
  const salt = bytes[0]!;

  // Dewhiten the region from byte 1 onward
  const whitenedRegion = bytes.subarray(1);
  const dewhitened = whiten(whitenedRegion, salt);

  // Check minimum length of dewhitened region:
  // magic (1) + version+type (1) + message_id (2) + seq (1) + body (0+) + crc16 (2) = at least 7 bytes
  if (dewhitened.length < 7) {
    return null;
  }

  // Extract fields from dewhitened region
  const magic = dewhitened[0]!;
  const versionType = dewhitened[1]!;
  const messageIdLo = dewhitened[2]!;
  const messageIdHi = dewhitened[3]!;
  const seq = dewhitened[4]!;

  // Extract body and crc16
  const bodyLen = dewhitened.length - 7; // total - (magic + versionType + messageId + seq + crc16)
  const bodyStart = 5;
  const body = dewhitened.subarray(bodyStart, bodyStart + bodyLen);
  const storedCrcLo = dewhitened[bodyStart + bodyLen]!;
  const storedCrcHi = dewhitened[bodyStart + bodyLen + 1]!;
  const storedCrc = storedCrcLo | (storedCrcHi << 8);

  // Validate magic byte
  if (magic !== MAGIC) {
    return null;
  }

  // Validate version (high nibble)
  const version = (versionType >>> 4) & 0x0f;
  if (version !== VERSION) {
    return null;
  }

  // Extract type (low nibble)
  const type = versionType & 0x0f;
  if (type !== FRAME_TYPE_MANIFEST && type !== FRAME_TYPE_DATA && type !== 2) {
    // type 2 is repair-request
    return null;
  }

  // Validate type-seq constraints
  if (type === FRAME_TYPE_MANIFEST && seq !== 0) {
    // Manifest frame must have seq = 0
    return null;
  }
  if (type === FRAME_TYPE_DATA && seq === 0) {
    // Data frame must have seq >= 1
    return null;
  }

  // Recompute CRC-16 over un-whitened magic..body (excluding crc16 field)
  const unwhitenedRegion = dewhitened.subarray(0, bodyStart + bodyLen);
  const computedCrc = crc16(unwhitenedRegion);

  // Verify CRC-16
  if (computedCrc !== storedCrc) {
    return null;
  }

  // Reconstruct message_id from little-endian bytes
  const messageId = messageIdLo | (messageIdHi << 8);

  // Return typed DecodedFrame based on type
  if (type === FRAME_TYPE_MANIFEST) {
    return {
      magic: MAGIC,
      version: VERSION,
      type: FRAME_TYPE_MANIFEST,
      messageId,
      seq: 0,
      body: new Uint8Array(body),
    } as ManifestFrame;
  } else if (type === FRAME_TYPE_DATA) {
    return {
      magic: MAGIC,
      version: VERSION,
      type: FRAME_TYPE_DATA,
      messageId,
      seq,
      body: new Uint8Array(body),
    } as DataFrame;
  } else {
    // type === 2 (repair-request)
    return {
      magic: MAGIC,
      version: VERSION,
      type: 2,
      messageId,
      seq,
      body: new Uint8Array(body),
    } as RepairRequestFrame;
  }
}
