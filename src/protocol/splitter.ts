/**
 * Payload splitter: converts a payload into a manifest frame + data frames.
 *
 * Splits a payload into chunks, computes CRC-32, and builds frames via buildFrame.
 * Each data frame body carries up to (MAX_FRAME - 8) = 120 bytes of payload.
 * Returns error if the payload requires > 255 data frames.
 */

import { MAX_FRAME, FRAME_TYPE_MANIFEST, FRAME_TYPE_DATA } from './constants.js';
import { crc32 } from './crc32.js';
import { buildFrame } from './frame-encoder.js';
import { serializeManifest } from './manifest.js';
import type { FrameFields, EncoderOptions, RngSource, SplitOptions, SplitResult } from './types.js';

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
 * Split `payload` into a manifest frame + data frames.
 *
 * Each data frame body holds up to (MAX_FRAME - 8) = 120 bytes of payload.
 * Returns error if the payload requires > 255 data frames.
 *
 * Algorithm:
 * 1. Compute chunkSize = MAX_FRAME - 8 (= 120)
 * 2. Split payload into chunks
 * 3. If chunks.length > 255, return error
 * 4. Generate messageId via rng() (2 bytes) or use override
 * 5. Compute crc32(payload)
 * 6. Build ManifestBody, call serializeManifest
 * 7. Call buildFrame with type=0, seq=0, body=manifestBytes
 * 8. For each chunk i (1-indexed), call buildFrame with type=1, seq=i, body=chunk
 * 9. Return { ok: true, messageId, frames: [manifestFrame, ...dataFrames] }
 */
export function splitPayload(payload: Uint8Array, options: SplitOptions): SplitResult {
  const rng = options.rng ?? defaultRng;

  // Calculate chunk size: MAX_FRAME - 8 (1 salt + 5 header + 2 crc16)
  const chunkSize = MAX_FRAME - 8; // = 120

  // Split payload into chunks
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < payload.length; i += chunkSize) {
    chunks.push(payload.slice(i, i + chunkSize));
  }

  const totalFrames = chunks.length;

  // Check if we exceed the maximum number of data frames (255)
  if (totalFrames > 255) {
    return { ok: false, error: 'payload-too-large' };
  }

  // Generate or use provided messageId
  let messageId: number;
  if (options.messageId !== undefined) {
    messageId = options.messageId & 0xffff;
  } else {
    // Generate 2 random bytes
    const byte0 = rng() & 0xff;
    const byte1 = rng() & 0xff;
    messageId = byte0 | (byte1 << 8);
  }

  // Compute CRC-32 of the full payload
  const crc32Value = crc32(payload);

  // Build ManifestBody
  const manifestBody = {
    totalFrames,
    kind: options.kind,
    flags: options.flags,
    payloadLen: payload.length,
    crc32: crc32Value,
    ...(options.flags.locked && {
      encSalt: options.encSalt!,
      iv: options.iv!,
    }),
  };

  // Serialise manifest
  const manifestBytes = serializeManifest(manifestBody);

  // Build manifest frame (seq = 0)
  const manifestResult = buildFrame(
    {
      type: FRAME_TYPE_MANIFEST,
      messageId,
      seq: 0,
      body: manifestBytes,
    },
    { rng }
  );

  if (!manifestResult.ok) {
    // This should not happen in normal operation since manifestBytes is small
    throw new Error(`Failed to build manifest frame: ${manifestResult.error}`);
  }

  const frames: Uint8Array[] = [manifestResult.frame];

  // Build data frames (seq = 1..totalFrames)
  for (let i = 0; i < chunks.length; i++) {
    const seq = i + 1;
    const dataResult = buildFrame(
      {
        type: FRAME_TYPE_DATA,
        messageId,
        seq,
        body: chunks[i]!,
      },
      { rng }
    );

    if (!dataResult.ok) {
      throw new Error(`Failed to build data frame ${seq}: ${dataResult.error}`);
    }

    frames.push(dataResult.frame);
  }

  return { ok: true, messageId, frames };
}
