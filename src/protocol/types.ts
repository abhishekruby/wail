/**
 * Shared TypeScript interfaces and type aliases for the packet protocol layer.
 *
 * This file imports only from constants.ts and is imported by frame-encoder,
 * frame-decoder, manifest, splitter, and reassembler to avoid circular imports.
 */

// ============================================================================
// RNG and encoder options
// ============================================================================

/** Source of random bytes in [0, 255]. Injectable for deterministic tests. */
export type RngSource = () => number;

export interface EncoderOptions {
  /** Injectable RNG (default: crypto.getRandomValues-based). */
  rng?: RngSource;
}

// ============================================================================
// Frame building
// ============================================================================

/** Fields needed to build one frame. */
export interface FrameFields {
  /** Frame type: 0 manifest, 1 data, 2 repair-request. */
  type: 0 | 1 | 2;
  /** 2-byte message identifier, same for all frames of one message. */
  messageId: number;
  /** 0 = manifest, 1–255 = data. */
  seq: number;
  /** Body bytes (before zero-padding). Max 120 bytes. */
  body: Uint8Array;
}

export type EncodeResult =
  | { ok: true; frame: Uint8Array }
  | { ok: false; error: 'body-too-large' | 'frame-too-large' };

// ============================================================================
// Frame decoding (typed union)
// ============================================================================

interface BaseDecodedFrame {
  magic: 0x57;
  version: 1;
  messageId: number;
}

export interface ManifestFrame extends BaseDecodedFrame {
  type: 0;
  seq: 0;
  body: Uint8Array; // raw manifest body bytes; pass to ManifestParser
}

export interface DataFrame extends BaseDecodedFrame {
  type: 1;
  seq: number; // 1–255
  body: Uint8Array;
}

export interface RepairRequestFrame extends BaseDecodedFrame {
  type: 2;
  seq: number;
  body: Uint8Array;
}

export type DecodedFrame = ManifestFrame | DataFrame | RepairRequestFrame;

// ============================================================================
// Manifest serialisation / parsing
// ============================================================================

export type FrameKind = 0 | 1 | 2 | 3 | 4; // text, contact, location, notice, file

export interface ManifestFlags {
  compressed: boolean;
  locked: boolean;
  broadcast: boolean;
}

/** Unlocked manifest (9 bytes serialised). */
export interface PlainManifestBody {
  totalFrames: number; // uint8
  kind: FrameKind;
  flags: ManifestFlags;
  payloadLen: number; // uint16 LE
  crc32: number; // uint32 LE
}

/** Locked manifest (9 + 16 + 12 = 37 bytes serialised). */
export interface LockedManifestBody extends PlainManifestBody {
  encSalt: Uint8Array; // 16 bytes — AES-GCM salt for PBKDF2
  iv: Uint8Array; // 12 bytes — AES-GCM nonce
}

export type ManifestBody = PlainManifestBody | LockedManifestBody;

export type ManifestParseResult =
  | { ok: true; value: ManifestBody }
  | { ok: false; error: 'too-short' | 'unknown-kind' };

// ============================================================================
// Payload splitting
// ============================================================================

export interface SplitOptions {
  kind: FrameKind;
  flags: ManifestFlags;
  /** Present only when flags.locked is true. */
  encSalt?: Uint8Array;
  iv?: Uint8Array;
  rng?: RngSource;
  /** Override message_id (for retransmissions). Generated fresh if omitted. */
  messageId?: number;
}

export type SplitResult =
  | { ok: true; messageId: number; frames: Uint8Array[] }
  | { ok: false; error: 'payload-too-large' };

// ============================================================================
// Reassembly and replay guard
// ============================================================================

export interface ReassemblerOptions {
  /** Injectable clock (default: Date.now). */
  clock?: () => number;
  replayGuard?: { has(messageId: number): boolean; record(messageId: number): void };
}

export type ReassemblyResult =
  | { status: 'complete'; payload: Uint8Array }
  | { status: 'incomplete' }
  | { status: 'crc-fail' }
  | { status: 'replayed' };
