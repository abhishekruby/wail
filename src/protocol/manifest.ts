/**
 * Manifest body serialisation and parsing.
 *
 * Serialises a ManifestBody to a Uint8Array (9 bytes plain, 37 bytes locked).
 * Parses a Uint8Array back into a ManifestBody with error handling (never throws).
 */

import type {
  FrameKind,
  ManifestFlags,
  PlainManifestBody,
  LockedManifestBody,
  ManifestBody,
  ManifestParseResult,
} from './types.js';

/**
 * Encode a 32-bit unsigned integer to 4 little-endian bytes.
 */
function encodeU32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  bytes[2] = (value >>> 16) & 0xff;
  bytes[3] = (value >>> 24) & 0xff;
  return bytes;
}

/**
 * Encode a 16-bit unsigned integer to 2 little-endian bytes.
 */
function encodeU16LE(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[0] = value & 0xff;
  bytes[1] = (value >>> 8) & 0xff;
  return bytes;
}

/**
 * Decode 2 little-endian bytes to a 16-bit unsigned integer.
 */
function decodeU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! & 0xff) | ((bytes[offset + 1]! & 0xff) << 8);
}

/**
 * Decode 4 little-endian bytes to a 32-bit unsigned integer.
 */
function decodeU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! & 0xff) |
    ((bytes[offset + 1]! & 0xff) << 8) |
    ((bytes[offset + 2]! & 0xff) << 16) |
    ((bytes[offset + 3]! & 0xff) << 24)
  ) >>> 0;
}

/**
 * Encode flags byte from ManifestFlags.
 * bit0 = compressed, bit1 = locked, bit2 = broadcast.
 */
function encodeFlags(flags: ManifestFlags): number {
  let byte = 0;
  if (flags.compressed) byte |= 0x01;
  if (flags.locked) byte |= 0x02;
  if (flags.broadcast) byte |= 0x04;
  return byte;
}

/**
 * Decode flags byte to ManifestFlags.
 */
function decodeFlags(byte: number): ManifestFlags {
  return {
    compressed: (byte & 0x01) !== 0,
    locked: (byte & 0x02) !== 0,
    broadcast: (byte & 0x04) !== 0,
  };
}

/**
 * Serialise a ManifestBody to Uint8Array (9 bytes plain, 37 bytes locked).
 *
 * Layout (little-endian):
 *   Offset  Len  Field
 *   0       1    total_frames
 *   1       1    kind
 *   2       1    flags (bit0=compressed, bit1=locked, bit2=broadcast)
 *   3       2    payload_len (LE)
 *   5       4    crc32 (LE)
 *   -- if locked (flags & 0x02):
 *   9       16   enc_salt
 *   25      12   iv
 */
export function serializeManifest(body: ManifestBody): Uint8Array {
  const isLocked = body.flags.locked;
  const totalLength = isLocked ? 37 : 9;
  const result = new Uint8Array(totalLength);

  result[0] = body.totalFrames & 0xff;
  result[1] = body.kind & 0xff;
  result[2] = encodeFlags(body.flags);

  const payloadLen = encodeU16LE(body.payloadLen);
  result[3] = payloadLen[0]!;
  result[4] = payloadLen[1]!;

  const crc32Bytes = encodeU32LE(body.crc32);
  result[5] = crc32Bytes[0]!;
  result[6] = crc32Bytes[1]!;
  result[7] = crc32Bytes[2]!;
  result[8] = crc32Bytes[3]!;

  if (isLocked) {
    const lockedBody = body as LockedManifestBody;
    result.set(lockedBody.encSalt, 9);
    result.set(lockedBody.iv, 25);
  }

  return result;
}

/**
 * Parse a Uint8Array into ManifestBody.
 *
 * Returns error if:
 *   - bytes.length < 9 (absolute minimum for detection)
 *   - kind > 4 (unknown-kind error)
 *
 * Does NOT throw.
 */
export function parseManifest(bytes: Uint8Array): ManifestParseResult {
  // Check minimum length for plain manifest
  if (bytes.length < 9) {
    return { ok: false, error: 'too-short' };
  }

  const totalFrames = bytes[0]!;
  const kind = bytes[1]! as FrameKind;
  const flagsByte = bytes[2]!;
  const payloadLen = decodeU16LE(bytes, 3);
  const crc32Value = decodeU32LE(bytes, 5);

  // Check if kind is valid (0–4)
  if (kind > 4) {
    return { ok: false, error: 'unknown-kind' };
  }

  const flags = decodeFlags(flagsByte);

  // If locked, check that we have enough bytes for salt + iv
  if (flags.locked) {
    if (bytes.length < 37) {
      return { ok: false, error: 'too-short' };
    }

    const encSalt = bytes.slice(9, 25);
    const iv = bytes.slice(25, 37);

    const body: LockedManifestBody = {
      totalFrames,
      kind,
      flags,
      payloadLen,
      crc32: crc32Value,
      encSalt,
      iv,
    };

    return { ok: true, value: body };
  } else {
    const body: PlainManifestBody = {
      totalFrames,
      kind,
      flags,
      payloadLen,
      crc32: crc32Value,
    };

    return { ok: true, value: body };
  }
}
