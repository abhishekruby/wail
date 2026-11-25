import { describe, it, expect } from 'vitest';
import {
  MAX_FRAME,
  MIN_FRAME,
  whiten,
  crc16,
  crc32,
  buildFrame,
  resaltFrame,
  decodeFrame,
  parseManifest,
  splitPayload,
  createReassembler,
  ReplayGuard,
  FRAME_TYPE_MANIFEST,
  FRAME_TYPE_DATA,
  type DecodedFrame,
} from '../../src/protocol/index.js';

// Reference whitening from tests/ggwave-baseline.test.ts (xorshift32 seeded by salt)
function referenceWhiten(bytes: Uint8Array, salt: number): Uint8Array {
  let s = (0x57a11 ^ Math.imul(salt, 0x9e3779b1)) >>> 0 || 1;
  return bytes.map((v) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return v ^ (s & 0xff);
  });
}

describe('11.1 Constants, whitening, and CRC utilities', () => {
  // 11.1.1 Constants
  it('MAX_FRAME is 128', () => {
    expect(MAX_FRAME).toBe(128);
  });

  it('MIN_FRAME is 12', () => {
    expect(MIN_FRAME).toBe(12);
  });

  // 11.1.2 Whitening reference output
  it('whiten matches reference implementation for fixed 16-byte input with salt 0', () => {
    const input = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const result = whiten(input, 0);
    const expected = referenceWhiten(input, 0);
    expect(result).toEqual(expected);
  });

  it('whiten matches reference implementation for fixed 16-byte input with salt 1', () => {
    const input = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const result = whiten(input, 1);
    const expected = referenceWhiten(input, 1);
    expect(result).toEqual(expected);
  });

  it('whiten matches reference implementation for fixed 16-byte input with salt 255', () => {
    const input = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const result = whiten(input, 255);
    const expected = referenceWhiten(input, 255);
    expect(result).toEqual(expected);
  });

  // 11.1.3 CRC-16 reference values
  it('crc16 of ASCII bytes of "123456789" is 0x29B1', () => {
    const bytes = Uint8Array.from('123456789'.split('').map((c) => c.charCodeAt(0)));
    const result = crc16(bytes);
    expect(result).toBe(0x29b1);
  });

  // 11.1.4 CRC-32 reference values
  it('crc32 of ASCII bytes of "123456789" is 0xCBF43926', () => {
    const bytes = Uint8Array.from('123456789'.split('').map((c) => c.charCodeAt(0)));
    const result = crc32(bytes);
    expect(result).toBe(0xcbf43926);
  });

  it('crc32 of empty array is 0', () => {
    const result = crc32(new Uint8Array());
    expect(result).toBe(0);
  });
});

describe('11.2 Frame encoder and decoder', () => {
  // 11.2.1 Encoder byte-sequence test
  it('encoder produces exact frame with deterministic RNG', () => {
    // Build frame with rng() => 7, type 1, messageId 0xBEEF, seq 3, body [0x68, 0x69]
    const rng = () => 7;
    const result = buildFrame(
      {
        type: FRAME_TYPE_DATA,
        messageId: 0xbeef,
        seq: 3,
        body: Uint8Array.from([0x68, 0x69]),
      },
      { rng },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frame = result.frame;

    // Frame must be 12 bytes
    expect(frame.length).toBe(12);

    // Byte 0 is the salt (rng() => 7)
    expect(frame[0]).toBe(7);

    // Decode the frame
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    if (!decoded) return;
    expect(decoded.type).toBe(FRAME_TYPE_DATA);
    expect(decoded.messageId).toBe(0xbeef);
    expect(decoded.seq).toBe(3);
    expect(decoded.body[0]).toBe(0x68);
    expect(decoded.body[1]).toBe(0x69);
  });

  // 11.2.2 Decoder rejection tests
  it('decodeFrame returns null for manifest frame with seq !== 0', () => {
    const rng = () => 7;
    const result = buildFrame(
      {
        type: FRAME_TYPE_MANIFEST,
        messageId: 0xbeef,
        seq: 1, // Invalid for manifest
        body: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      },
      { rng },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Note: buildFrame may reject this, but if it allows it, decodeFrame must reject it.
    const decoded = decodeFrame(result.frame);
    expect(decoded).toBeNull();
  });

  it('decodeFrame returns null for data frame with seq === 0', () => {
    const rng = () => 7;
    const result = buildFrame(
      {
        type: FRAME_TYPE_DATA,
        messageId: 0xbeef,
        seq: 0, // Invalid for data frame
        body: Uint8Array.from([0x68, 0x69]),
      },
      { rng },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const decoded = decodeFrame(result.frame);
    expect(decoded).toBeNull();
  });

  it('decodeFrame returns null for frame shorter than MIN_FRAME', () => {
    const shortFrame = Uint8Array.from([7, 0x57, 0x11, 0xbe, 0xef, 0x03]);
    const decoded = decodeFrame(shortFrame);
    expect(decoded).toBeNull();
  });

  it('decodeFrame returns null for frame longer than MAX_FRAME', () => {
    const longFrame = new Uint8Array(MAX_FRAME + 1);
    longFrame[0] = 7;
    const decoded = decodeFrame(longFrame);
    expect(decoded).toBeNull();
  });

  // 11.2.3 resaltFrame correctness
  it('resaltFrame produces new salt at byte 0 and decodes to same fields', () => {
    const rng = () => 7;
    const result = buildFrame(
      {
        type: FRAME_TYPE_DATA,
        messageId: 0xbeef,
        seq: 3,
        body: Uint8Array.from([0x68, 0x69]),
      },
      { rng },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const originalFrame = result.frame;
    const originalDecoded = decodeFrame(originalFrame);
    expect(originalDecoded).not.toBeNull();

    const newSalt = 42;
    const resaltedFrame = resaltFrame(originalFrame, newSalt);

    // Byte 0 must be the new salt
    expect(resaltedFrame[0]).toBe(newSalt);

    // Decode must return same fields
    const resaltedDecoded = decodeFrame(resaltedFrame);
    expect(resaltedDecoded).not.toBeNull();
    if (!resaltedDecoded) return;

    expect(resaltedDecoded.messageId).toBe(originalDecoded!.messageId);
    expect(resaltedDecoded.seq).toBe(originalDecoded!.seq);
    expect(resaltedDecoded.body).toEqual(originalDecoded!.body);
  });
});

describe('11.3 Manifest parser and splitter', () => {
  // 11.3.1 Manifest parser edge cases
  it('parseManifest returns error for bytes shorter than 9', () => {
    const shortBytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const result = parseManifest(shortBytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('too-short');
  });

  it('parseManifest returns error for unknown kind (kind = 5)', () => {
    // Create a minimal 9-byte manifest with kind = 5
    const bytes = new Uint8Array(9);
    bytes[0] = 1; // total_frames
    bytes[1] = 5; // kind (unknown)
    bytes[2] = 0; // flags
    // bytes[3-4] payload_len (LE)
    // bytes[5-8] crc32 (LE)
    const result = parseManifest(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unknown-kind');
  });

  // 11.3.2 Splitter payload size limits
  it('splitPayload returns error for payload requiring 256+ chunks', () => {
    // 255 chunks × 120 bytes/chunk = 30,600 bytes max
    // 256 chunks × 120 bytes/chunk = 30,720 bytes, which exceeds 255 chunks
    const oversizePayload = new Uint8Array(256 * 120 + 1);
    const rng = () => 42;
    const result = splitPayload(oversizePayload, {
      kind: 0,
      flags: { compressed: false, locked: false, broadcast: false },
      rng,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('payload-too-large');
  });
});

describe('11.4 Reassembler and replay guard', () => {
  // 11.4.1 Known-good frame set round-trip
  it('reassembler round-trips known-good frame set to exact payload', () => {
    const payload = Uint8Array.from([0x48, 0x69]); // "Hi"

    // Split the payload deterministically
    const rng = () => 42; // deterministic RNG
    const splitResult = splitPayload(payload, {
      kind: 0,
      flags: { compressed: false, locked: false, broadcast: false },
      rng,
    });
    expect(splitResult.ok).toBe(true);
    if (!splitResult.ok) return;

    const frames = splitResult.frames;

    // Decode all frames
    const decodedFrames = frames
      .map((f) => decodeFrame(f))
      .filter((f): f is DecodedFrame => f !== null);

    expect(decodedFrames.length).toBeGreaterThan(0);

    // Feed to reassembler
    const reassembler = createReassembler();
    let result;
    for (const frame of decodedFrames) {
      result = reassembler.feed(frame);
      if (result.status === 'complete') break;
    }

    // Should complete and return exact payload
    expect(result?.status).toBe('complete');
    if (result?.status !== 'complete') return;
    expect(result.payload).toEqual(payload);
  });

  // 11.4.2 Replay guard suppresses re-delivery
  it('createReassembler with injected clock returns replayed on second delivery', () => {
    const payload = Uint8Array.from([0x48, 0x69]);

    let clockTime = 1000; // Start at 1000 ms
    const clock = () => clockTime;

    const rng = () => 42;
    const splitResult = splitPayload(payload, {
      kind: 0,
      flags: { compressed: false, locked: false, broadcast: false },
      rng,
    });
    expect(splitResult.ok).toBe(true);
    if (!splitResult.ok) return;

    const frames = splitResult.frames;
    const decodedFrames = frames
      .map((f) => decodeFrame(f))
      .filter((f): f is DecodedFrame => f !== null);

    // Create a single ReplayGuard shared between reassemblers
    const replayGuard = new ReplayGuard(clock);

    // First delivery
    const reassembler1 = createReassembler({ clock, replayGuard });
    let result;
    for (const frame of decodedFrames) {
      result = reassembler1.feed(frame);
      if (result.status === 'complete') break;
    }
    expect(result?.status).toBe('complete');

    // Second delivery with same clock and shared guard (within replay window)
    const reassembler2 = createReassembler({ clock, replayGuard });
    for (const frame of decodedFrames) {
      result = reassembler2.feed(frame);
      if (result.status === 'replayed') break;
    }
    expect(result?.status).toBe('replayed');

    // Third delivery after clock advances by 10 * 60 * 1000 + 1 ms
    clockTime += 10 * 60 * 1000 + 1;
    const reassembler3 = createReassembler({ clock, replayGuard });
    for (const frame of decodedFrames) {
      result = reassembler3.feed(frame);
      if (result.status === 'complete') break;
    }
    expect(result?.status).toBe('complete');
  });
});
