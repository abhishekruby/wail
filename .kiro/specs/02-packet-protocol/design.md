# Design Document — Packet Protocol (`src/protocol/`)

## Overview

The packet protocol layer converts a byte payload into one or more over-the-air frames and reconstructs it on the receiving side. It is pure TypeScript: no DOM, no Web Audio, no IndexedDB. Every module runs in Node and is fully testable without a browser.

The layer's responsibilities, in send order:

1. **Whitening** — XOR the frame body with a pseudo-random stream so ggwave never sees low-entropy patterns that it silently corrupts.
2. **CRC-16** — Integrity-protect each individual frame so a corrupted decode is dropped before it reaches the reassembler.
3. **CRC-32** — Integrity-protect the entire reassembled payload so any error that slips past the per-frame check is still caught.
4. **Frame encoding** — Pack fields into the wire layout and emit a `Uint8Array` ready to pass to the modem.
5. **Frame decoding** — Strip and validate the outer envelope, returning typed fields or null.
6. **Manifest serialisation / parsing** — Serialise and parse the manifest body that carries message metadata.
7. **Payload splitting** — Split a payload into one manifest frame plus up to 255 data frames.
8. **Reassembly** — Buffer frames per `message_id`, tolerate any arrival order and duplicates, declare completeness, and verify CRC-32.
9. **Replay guard** — Suppress re-delivery of a `message_id` seen within the last 10 minutes.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     src/protocol/                         │
│                                                           │
│  constants.ts     MAX_FRAME=128, MIN_FRAME=12             │
│                                                           │
│  whiten.ts        xorshift32-based XOR mask               │
│  crc16.ts         CRC-16/CCITT-FALSE (lookup table)       │
│  crc32.ts         ISO 3309 / IEEE 802.3 CRC-32            │
│                                                           │
│  frame-encoder.ts build(fields) → Uint8Array              │
│  frame-decoder.ts parse(bytes) → DecodedFrame | null      │
│                                                           │
│  manifest.ts      ManifestBody ↔ Uint8Array               │
│                                                           │
│  splitter.ts      split(payload, opts) → Frame[][]        │
│  reassembler.ts   feed(frame) → ReassemblyResult          │
│  replay-guard.ts  ReplayGuard class                       │
│                                                           │
│  index.ts         public API barrel                       │
└───────────────────────────────────────────────────────────┘
         ↓ used by
  src/app/  (message service)
  src/modem/ (PassthroughModem in tests)
```

**Dependency rule**: `src/protocol/` imports nothing outside itself (no `src/app/`, `src/ui/`, `src/audio/`, `src/modem/`, `src/store/`). It is a leaf layer.

### Component interaction — send path

```
caller
  │
  ├─ splitter.split(payload, opts)
  │      ├─ manifest.serialize(manifestBody) → Uint8Array
  │      └─ frame-encoder.build(fields, rng) → Uint8Array   (once per frame)
  │             ├─ crc32 over payload
  │             ├─ crc16 over un-whitened magic..body
  │             └─ whiten(magic..crc16, salt)
  │
  └─ [Uint8Array, Uint8Array, ...]  → modem.encode()
```

### Component interaction — receive path

```
modem.feed() → Uint8Array
  │
  ├─ frame-decoder.parse(bytes)
  │      ├─ whiten(bytes[1..], salt) to dewhiten
  │      ├─ crc16 verify → null on mismatch
  │      └─ DecodedFrame (manifest | data | repair-request)
  │
  └─ reassembler.feed(decodedFrame)
         ├─ replay-guard.check(message_id) → replayed?
         ├─ buffer frame, check completeness
         ├─ crc32 verify on completion
         └─ ReassemblyResult
```

---

## Components and Interfaces

### `src/protocol/constants.ts`

```ts
export const MAX_FRAME = 128;  // ggwave hard limit is 140; leave headroom
export const MIN_FRAME = 12;
export const MAGIC    = 0x57;  // "W"
export const VERSION  = 1;
export const FRAME_TYPE_MANIFEST       = 0;
export const FRAME_TYPE_DATA           = 1;
export const FRAME_TYPE_REPAIR_REQUEST = 2;
export const REPLAY_WINDOW_MS = 10 * 60 * 1000;
```

---

### `src/protocol/whiten.ts`

```ts
/**
 * XOR `bytes` with an xorshift32 stream seeded by `(0x57A11 ^ salt * 0x9E3779B1)`.
 * Seed 0 is replaced with 1. Applying twice with the same salt returns the original
 * (involution property). This is both encode and decode.
 */
export function whiten(bytes: Uint8Array, salt: number): Uint8Array;
```

The reference implementation from `tests/ggwave-baseline.test.ts`:

```
seed = (0x57A11 ^ Math.imul(salt, 0x9E3779B1)) >>> 0 || 1
per byte:
  seed ^= seed << 13; seed >>>= 0
  seed ^= seed >>> 17
  seed ^= seed << 5;  seed >>>= 0
  out[i] = bytes[i] ^ (seed & 0xff)
```

Returns a **new** `Uint8Array` (never mutates input). Both encoder and decoder call this function; the two calls are identical.

---

### `src/protocol/crc16.ts`

```ts
/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection).
 * Input: un-whitened bytes from `magic` through end of `body`.
 * Returns a 16-bit unsigned integer.
 */
export function crc16(bytes: Uint8Array): number;
```

**Implementation**: 256-entry lookup table generated once at module load time. Poly `0x1021`, init `0xFFFF`, input/output not reflected. This matches the CRC-16/CCITT-FALSE variant (also called CRC-16/IBM-3740).

No new dependency — implemented from scratch with the standard lookup-table algorithm. A lookup table costs ~512 bytes of memory and runs at ~1 ns/byte, fast enough for 128-byte frames.

---

### `src/protocol/crc32.ts`

```ts
/**
 * ISO 3309 / IEEE 802.3 CRC-32 (poly 0xEDB88320 reflected).
 * Input: the complete reassembled payload bytes.
 * Returns a 32-bit unsigned integer.
 */
export function crc32(bytes: Uint8Array): number;
```

**Implementation**: 256-entry lookup table, reflected polynomial `0xEDB88320`, init `0xFFFFFFFF`, final XOR `0xFFFFFFFF`. Same algorithm used by zlib and Ethernet. No new dependency.

---

### `src/protocol/frame-encoder.ts`

#### Types

```ts
/** Source of random bytes in [0, 255]. Injectable for deterministic tests. */
export type RngSource = () => number;

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

export interface EncoderOptions {
  /** Injectable RNG (default: crypto.getRandomValues-based). */
  rng?: RngSource;
}

export type EncodeResult =
  | { ok: true; frame: Uint8Array }
  | { ok: false; error: 'body-too-large' | 'frame-too-large' };
```

#### API

```ts
/**
 * Build one raw frame Uint8Array from the given fields.
 * - Generates a fresh salt via rng().
 * - Zero-pads body so total frame >= MIN_FRAME.
 * - Computes CRC-16 over un-whitened magic..body.
 * - Whitens magic..crc16.
 * Returns an error if body > 120 bytes or resulting frame > MAX_FRAME.
 */
export function buildFrame(fields: FrameFields, options?: EncoderOptions): EncodeResult;
```

#### Wire layout produced

```
Offset  Len  Field
0       1    salt          (clear, from rng())
1       1    magic         (0x57, pre-whitening)
2       1    version+type  (high nibble 1, low nibble type)
3       2    message_id    (little-endian)
5       1    seq
6       N    body          (zero-padded to reach MIN_FRAME if needed)
6+N     2    crc16         (little-endian, over bytes 1..5+N pre-whitening)
```

After zero-padding and CRC-16, the region `[1 .. end]` (magic through crc16) is whitened in one pass.

---

### `resaltFrame`

```ts
/**
 * Re-whiten a frame with a new salt.
 * Dewhitens the existing whitened region using the original salt (bytes[0]),
 * replaces salt at byte 0 with newSalt, then rewhitens the entire region
 * [1..end] with newSalt. Pure — returns a new Uint8Array; never mutates input.
 *
 * Used by the broadcast carousel: each repeat of a frame calls resaltFrame
 * with a salt different from the one used in the previous repeat, so a frame
 * that ggwave corrupts on one cycle gets an independent decode attempt on the next.
 */
export function resaltFrame(frame: Uint8Array, newSalt: number): Uint8Array;
```

**Algorithm**:
1. Extract `oldSalt = frame[0]`.
2. Dewhiten `frame.subarray(1)` using `whiten(frame.subarray(1), oldSalt)` to recover the un-whitened region.
3. Set `result[0] = newSalt`.
4. Rewhiten the region with `whiten(unwhitened, newSalt)` and place it at `result[1..]`.
5. Return `result`.

---

### `src/protocol/frame-decoder.ts`

#### Types

```ts
interface BaseDecodedFrame {
  magic: 0x57;
  version: 1;
  messageId: number;
}

export interface ManifestFrame extends BaseDecodedFrame {
  type: 0;
  seq: 0;
  body: Uint8Array;  // raw manifest body bytes; pass to ManifestParser
}

export interface DataFrame extends BaseDecodedFrame {
  type: 1;
  seq: number;       // 1–255
  body: Uint8Array;
}

export interface RepairRequestFrame extends BaseDecodedFrame {
  type: 2;
  seq: number;
  body: Uint8Array;
}

export type DecodedFrame = ManifestFrame | DataFrame | RepairRequestFrame;
```

#### API

```ts
/**
 * Parse and validate a raw frame byte array.
 * Returns null (silently) on any of:
 *   - length < MIN_FRAME or > MAX_FRAME
 *   - CRC-16 mismatch after dewhitening
 *   - magic byte != 0x57 after dewhitening
 *   - version nibble != 1
 *   - type nibble not in {0, 1, 2}
 *   - type is 0 (manifest) but seq is not 0
 *   - type is 1 (data) but seq is 0
 */
export function decodeFrame(bytes: Uint8Array): DecodedFrame | null;
```

#### Decode algorithm

1. Reject if `bytes.length < MIN_FRAME` or `bytes.length > MAX_FRAME`.
2. Extract `salt = bytes[0]`.
3. Call `whiten(bytes.subarray(1), salt)` → `dewhitened` (new array).
4. Split `dewhitened` into: `magic` (1), `versionType` (1), `messageId` (2 LE), `seq` (1), `body` (len − 8), `storedCrc` (2 LE).
5. Recompute `crc16(concat(magic, versionType, messageId, seq, body))`.
6. If computed CRC ≠ `storedCrc`, return `null`.
7. If `magic !== 0x57`, return `null`.
8. If `(versionType >>> 4) !== 1`, return `null`.
9. If `(versionType & 0x0f) not in {0, 1, 2}`, return `null`.
10. If `type === 0` (manifest) and `seq !== 0`, return `null`.
11. If `type === 1` (data) and `seq === 0`, return `null`.
12. Return typed `DecodedFrame`.

---

### `src/protocol/manifest.ts`

#### Types

```ts
export type FrameKind = 0 | 1 | 2 | 3 | 4;  // text, contact, location, notice, file

export interface ManifestFlags {
  compressed: boolean;
  locked: boolean;
  broadcast: boolean;
}

/** Unlocked manifest (9 bytes serialised). */
export interface PlainManifestBody {
  totalFrames: number;    // uint8
  kind: FrameKind;
  flags: ManifestFlags;
  payloadLen: number;     // uint16 LE
  crc32: number;          // uint32 LE
}

/** Locked manifest (9 + 16 + 12 = 37 bytes serialised when iv present, but we always write both). */
export interface LockedManifestBody extends PlainManifestBody {
  encSalt: Uint8Array;    // 16 bytes — AES-GCM salt for PBKDF2
  iv: Uint8Array;         // 12 bytes — AES-GCM nonce
}

export type ManifestBody = PlainManifestBody | LockedManifestBody;

export type ManifestParseResult =
  | { ok: true; value: ManifestBody }
  | { ok: false; error: 'too-short' | 'unknown-kind' };
```

#### API

```ts
/** Serialise a ManifestBody to Uint8Array (9 bytes plain, 37 bytes locked). */
export function serializeManifest(body: ManifestBody): Uint8Array;

/**
 * Parse a Uint8Array into ManifestBody.
 * Returns error if bytes.length < 9 (absolute minimum for detection) or kind > 4.
 * Does NOT throw.
 */
export function parseManifest(bytes: Uint8Array): ManifestParseResult;
```

#### Serialisation layout (little-endian throughout)

```
Offset  Len  Field
0       1    total_frames
1       1    kind
2       1    flags  (bit0=compressed, bit1=locked, bit2=broadcast)
3       2    payload_len (LE)
5       4    crc32 (LE)
-- if locked (flags & 0x02):
9       16   enc_salt
25      12   iv
```

Plain body: 9 bytes minimum; full plain (with all fields): 9 bytes.  
Locked body: 9 + 16 + 12 = 37 bytes.

> **Note on minimum size**: The `too-short` error fires when the input is shorter than 9 bytes (the plain manifest minimum). The `unknown-kind` error fires when byte[1] > 4.

---

### `src/protocol/splitter.ts`

#### Types

```ts
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
```

#### API

```ts
/**
 * Split `payload` into a manifest frame + data frames.
 * Each data frame body holds up to (MAX_FRAME - 8) bytes = 120 bytes of payload.
 * Returns error if the payload requires > 255 data frames.
 */
export function splitPayload(payload: Uint8Array, options: SplitOptions): SplitResult;
```

#### Algorithm

1. Compute `chunkSize = MAX_FRAME - 8` (= 120). Split `payload` into chunks.
2. If `chunks.length > 255`, return error.
3. Generate `messageId` via `rng()` (2 bytes) or use override.
4. Compute `crc32(payload)`.
5. Build `ManifestBody` (plain or locked), call `serializeManifest`.
6. Call `buildFrame` with `type=0, seq=0, body=manifestBytes`.
7. For each chunk `i` (1-indexed), call `buildFrame` with `type=1, seq=i, body=chunk`.
8. Return `{ ok: true, messageId, frames: [manifestFrame, ...dataFrames] }`.

---

### `src/protocol/reassembler.ts`

#### Types

```ts
export interface ReassemblerOptions {
  /** Injectable clock (default: Date.now). */
  clock?: () => number;
  replayGuard?: ReplayGuard;
}

/** Per-transfer buffer. Never exported; internal to Reassembler. */
interface Transfer {
  manifest: ManifestBody | null;
  frames: Map<number, Uint8Array>;    // seq → body bytes
  lastSeen: number;                   // ms timestamp from injected clock
}

export type ReassemblyResult =
  | { status: 'complete';    payload: Uint8Array }
  | { status: 'incomplete'                       }
  | { status: 'crc-fail'                         }
  | { status: 'replayed'                         };
```

#### API

```ts
/**
 * Feed one already-decoded frame into the reassembler.
 * The caller passes the output of decodeFrame(); if that returned null,
 * do not call feed — the frame is simply discarded.
 *
 * Returns 'incomplete' until every seq 1..total_frames and the manifest have arrived.
 * Returns 'complete' (with payload) on success.
 * Returns 'crc-fail' if CRC-32 fails.
 * Returns 'replayed' if message_id was recently completed.
 */
export function createReassembler(options?: ReassemblerOptions): {
  feed(frame: DecodedFrame): ReassemblyResult;
  /** Expire transfers older than REPLAY_WINDOW_MS (called internally on each feed). */
  expireStale(): void;
};

> Repair-request frames (`type === 2`) are accepted by `decodeFrame` but ignored by `feed()`: the Reassembler returns `{ status: 'incomplete' }` immediately without buffering or modifying any transfer state.
```

#### State machine — per-transfer lifecycle

```
                     ┌─────────────────────┐
              frame   │   PENDING           │
  ──────────────────► │  manifest: null | M │
                      │  frames: Map<seq,…> │
                      │  lastSeen: t        │
                      └────────┬────────────┘
                               │ manifest present AND
                               │ all seq 1..total_frames present
                               ▼
                      ┌─────────────────────┐
                      │   JOIN + CRC-32     │
                      └────────┬────────────┘
                   pass ◄──────┴──────► fail
                   │                        │
                   ▼                        ▼
              COMPLETE                 CRC-FAIL
      record in ReplayGuard       clear frames + manifest
      delete transfer             reset lastSeen, stay PENDING
      return { status: 'complete' }  return { status: 'crc-fail' }
```

**On `complete`**: After delivering the payload, the Reassembler calls `replayGuard.record(messageId)` and then deletes the transfer entry from the pending map, freeing all buffered frame bodies.

**On `crc-fail`**: The Reassembler clears the transfer's stored frames map and sets `manifest` back to `null` for that `message_id`, but keeps the transfer entry alive (resetting `lastSeen` to the current clock value). This allows the next broadcast cycle to refill the transfer from scratch with fresh frame copies.

#### Late-joiner path

Data frames (`seq ≥ 1`) may arrive before the manifest (`seq = 0`). The Reassembler buffers them under the `message_id` key with `manifest: null`. When the manifest arrives, it sets `manifest`, then immediately checks whether the already-buffered frames satisfy `frames.size >= manifest.totalFrames`. If so, it proceeds to join. This means arrival order is completely irrelevant to the final result.

#### Completeness check (called after every frame insertion)

```
complete =
  manifest !== null
  AND frames.size >= manifest.totalFrames
  AND (for every seq in 1..manifest.totalFrames: frames.has(seq))
```

#### Stale transfer expiry

On every call to `feed()`, the Reassembler sweeps the pending map for entries where `clock() - lastSeen > REPLAY_WINDOW_MS` and deletes them. This lazy sweep avoids a timer dependency and keeps the module pure. The only cost is O(pending transfers) on each feed, which is bounded in practice.

---

### `src/protocol/replay-guard.ts`

```ts
export class ReplayGuard {
  constructor(clock?: () => number);

  /** Returns true if message_id was recorded within the last REPLAY_WINDOW_MS. */
  has(messageId: number): boolean;

  /** Record message_id as completed at clock(). Lazily evicts stale entries. */
  record(messageId: number): void;
}
```

**State**: `Map<number, number>` mapping `message_id → recorded_at_ms`.

**Eviction strategy**: lazy — on every `record()` call, sweep the map and delete entries where `clock() - recorded_at > REPLAY_WINDOW_MS`. Justification: the guard holds at most a handful of message IDs in real usage (one message every few seconds); a background timer is not needed and would require cleanup.

**Clock injection**: the constructor takes an optional `() => number` clock (default `Date.now`). Property tests advance the clock by passing a custom function that returns controlled timestamps, so no real wall-clock delay is needed in tests.

---

### `src/protocol/index.ts`

Barrel that re-exports only the public surface:

```ts
export { MAX_FRAME, MIN_FRAME } from './constants.js';
export { whiten } from './whiten.js';
export { crc16 } from './crc16.js';
export { crc32 } from './crc32.js';
export { buildFrame, resaltFrame } from './frame-encoder.js';
export { decodeFrame } from './frame-decoder.js';
export { serializeManifest, parseManifest } from './manifest.js';
export { splitPayload } from './splitter.js';
export { createReassembler } from './reassembler.js';
export { ReplayGuard } from './replay-guard.js';
export type {
  FrameFields, EncoderOptions, EncodeResult, RngSource,
  DecodedFrame, ManifestFrame, DataFrame, RepairRequestFrame,
  ManifestBody, PlainManifestBody, LockedManifestBody, ManifestFlags, FrameKind,
  ManifestParseResult,
  SplitOptions, SplitResult,
  ReassemblerOptions, ReassemblyResult,
} from './types.js';
```

> All shared type-only definitions live in `src/protocol/types.ts` to avoid circular imports between encoder, decoder, reassembler, and splitter.

---

## Data Models

### Wire layout summary (little-endian)

```
Frame
├── salt          [0]      1 byte  — in the clear; seeds whitening
└── whitened region [1..]
    ├── magic              1 byte  — 0x57
    ├── version+type       1 byte  — high nibble 0x1, low nibble 0|1|2
    ├── message_id         2 bytes — LE uint16
    ├── seq                1 byte  — 0 = manifest, 1–255 = data
    ├── body               0–120 bytes — zero-padded to reach MIN_FRAME
    └── crc16              2 bytes — LE uint16; CRC-16/CCITT-FALSE over magic..body

Manifest body (inside body field of a manifest frame)
├── total_frames   1 byte  — uint8
├── kind           1 byte  — 0 text | 1 contact | 2 location | 3 notice | 4 file
├── flags          1 byte  — bit0 compressed, bit1 locked, bit2 broadcast
├── payload_len    2 bytes — LE uint16
├── crc32          4 bytes — LE uint32; CRC-32 over full payload
└── [if locked]
    ├── enc_salt  16 bytes — PBKDF2 salt
    └── iv        12 bytes — AES-GCM nonce
```

### IndexedDB (not this layer)

The reassembled `payload` is a `Uint8Array` handed up to `src/app/`; persistence is out of scope for this layer.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Whitening involution

*For any* `Uint8Array` of any length and any salt value in [0, 255], applying `whiten` twice with the same salt returns a byte sequence equal to the original.

**Validates: Requirements 2.6**

---

### Property 2: Single-byte corruption drops frame

*For any* valid encoded frame, flipping any single byte at any position in the whitened region (index ≥ 1) causes `decodeFrame` to return `null`.

**Validates: Requirements 3.6, 3.3**

---

### Property 3: Payload round-trip (split → reassemble)

*For any* `Uint8Array` of 0 to 2,048 bytes, splitting it with `splitPayload` and feeding every resulting frame through `decodeFrame` then `reassembler.feed` returns a payload byte-for-byte equal to the original.

**Validates: Requirements 4.6, 5.4, 5.5, 6.2**

---

### Property 4: Frame-length bounds

*For any* valid payload, every frame produced by `splitPayload` has byte length in the closed interval [MIN_FRAME, MAX_FRAME].

**Validates: Requirements 2.7, 4.7, 1.3, 1.4**

---

### Property 5: Order-independence and duplicate-tolerance

*For any* valid payload, shuffling its frame list into any order and inserting arbitrary duplicates before feeding to the Reassembler produces the same payload as feeding them in the original order.

**Validates: Requirements 5.6, 5.2**

---

### Property 6: Incomplete frame set never yields bytes

*For any* valid frame set with at least one data frame or the manifest removed, `reassembler.feed` never returns `{ status: 'complete' }` — it always returns `{ status: 'incomplete' }`.

**Validates: Requirements 5.7, 4.3**

---

### Property 7: CRC-32 flip rejection

*For any* reassembled payload with exactly one byte flipped at any position, the Reassembler returns `{ status: 'crc-fail' }` and exposes no bytes to the caller.

**Validates: Requirements 6.4, 6.3**

---

### Property 8: Replay guard suppresses re-delivery

*For any* successfully delivered message, feeding the same frames again within the 10-minute replay window returns `{ status: 'replayed' }` for every subsequent attempt. After the clock advances past 10 minutes, feeding the same frames returns `{ status: 'complete' }` again.

**Validates: Requirements 7.1, 7.2, 7.3**

---

### Property 9: Late-manifest delivery

*For any* valid frame set with the manifest frame delivered last (after all data frames), the Reassembler returns the same payload as it would if the manifest arrived first.

**Validates: Requirements 5.1, 5.3**

---

### Property 10: Manifest round-trip

*For any* valid `ManifestBody` (plain or locked), `parseManifest(serializeManifest(body))` returns `{ ok: true, value }` where `value` has fields equal to the original.

**Validates: Requirements 8.3, 8.2**

---

### Property 11: resaltFrame correctness

*For any* valid frame and any `newSalt` value in [0, 255] that differs from the frame's current salt (byte 0), `resaltFrame(frame, newSalt)` produces a frame where:
(a) byte 0 equals `newSalt`, and
(b) `decodeFrame(resaltFrame(frame, newSalt))` returns fields identical to `decodeFrame(frame)`.

**Validates: Requirements 2.5, 2.8**

---

## Error Handling

| Error condition | Where caught | Caller receives |
|---|---|---|
| Body > 120 bytes | `buildFrame` | `{ ok: false, error: 'body-too-large' }` |
| Frame > MAX_FRAME | `buildFrame` | `{ ok: false, error: 'frame-too-large' }` |
| Payload requires > 255 data frames | `splitPayload` | `{ ok: false, error: 'payload-too-large' }` |
| CRC-16 mismatch / magic wrong / bad version/type | `decodeFrame` | `null` |
| Frame shorter than MIN_FRAME or longer than MAX_FRAME | `decodeFrame` | `null` |
| Manifest body too short / unknown kind | `parseManifest` | `{ ok: false, error: 'too-short' \| 'unknown-kind' }` |
| CRC-32 mismatch after reassembly | `reassembler.feed` | `{ status: 'crc-fail' }` |
| Message replayed within 10 minutes | `reassembler.feed` | `{ status: 'replayed' }` |
| Missing frames | `reassembler.feed` | `{ status: 'incomplete' }` |

**Principle**: errors are values, never exceptions. The module never throws for invalid input. Exceptions from JavaScript internals (e.g. `RangeError` on a malformed `DataView`) bubble up and are the caller's responsibility.

---

## Testing Strategy

### Library

**fast-check** (already in devDependencies) for all property-based tests. **Vitest** as the test runner.

### No new runtime dependencies

CRC-16 and CRC-32 are implemented from scratch using lookup tables (each ~512 bytes). The alternative, adding a `crc` or `crc-32` package, is not justified given the small implementation surface and the need to control the exact variant.

### Property test plan

Each test file runs a minimum of **1,000 iterations** (`{ numRuns: 1000 }`). Tests never use real audio; they construct frames directly via `buildFrame` or `splitPayload` and feed raw bytes to `decodeFrame` / `reassembler.feed`.

| File | Properties covered | Requirement IDs | Key arbitraries |
|---|---|---|---|
| `tests/protocol/R1.round-trip.prop.test.ts` | P3 (round-trip) | R1, R3 | `fc.uint8Array({ minLength: 0, maxLength: 2048 })` for payload; deterministic RNG |
| `tests/protocol/R1.frame-bounds.prop.test.ts` | P4 (frame-length bounds) | R1 | Same as round-trip; assert `frame.length` in [12, 128] |
| `tests/protocol/R3.whiten-involution.prop.test.ts` | P1 (whitening involution) | R2 | `fc.uint8Array()` + `fc.integer({ min: 0, max: 255 })` for salt |
| `tests/protocol/R3.decoder-drop.prop.test.ts` | P2 (single-byte corruption) | R3, R4 | Valid frame + `fc.integer` for position + `fc.integer` for XOR mask |
| `tests/protocol/R3.order-independent.prop.test.ts` | P5 (order-independence + duplicates) | R3, R4 | `fc.shuffledSubarray` on frame list; `fc.array` with repeats |
| `tests/protocol/R4.missing-frame.prop.test.ts` | P6 (incomplete → no bytes) | R4 | Frame set with one random frame removed |
| `tests/protocol/R3.crc32-flip.prop.test.ts` | P7 (CRC-32 flip rejection) | R3, R4 | Reassembled payload + `fc.integer` for flip position |
| `tests/protocol/R3.late-manifest.prop.test.ts` | P9 (late-manifest arrival) | R3, R4 | Frame set fed with manifest last |
| `tests/protocol/R13.replay-guard.prop.test.ts` | P8 (replay guard) | R13 | Injected clock; `fc.integer` for time deltas |
| `tests/protocol/R8.manifest-round-trip.prop.test.ts` | P10 (manifest round-trip) | R8 | `fc.record` for `PlainManifestBody`; `fc.record` with `encSalt`/`iv` for locked |
| `tests/protocol/R1.resalt.prop.test.ts` | P11 (resaltFrame correctness) | R1, R2 | Valid frame from `buildFrame`; `fc.integer({ min: 0, max: 255 })` for newSalt; filter where newSalt !== frame[0] |

### Unit tests (example-based)

All example-based unit tests live in a single file: **`tests/protocol/protocol.test.ts`**. This file covers:
- Known-good frame bytes decoded to exact field values (regression guard).
- Encoder producing the byte sequence expected by the reference whitening in `tests/ggwave-baseline.test.ts`.
- `MAX_FRAME` and `MIN_FRAME` constant values.
- `parseManifest` on a byte array shorter than 9 bytes and one with `kind = 5`.
- `splitPayload` returning an error for a payload requiring 256 chunks.
- `resaltFrame` producing a frame with the new salt in byte 0 that decodes identically.
- `decodeFrame` returning `null` for a manifest frame with `seq ≠ 0` and for a data frame with `seq = 0`.

Property test files (one per property, in `tests/protocol/`) handle exhaustive coverage via fast-check. The `protocol.test.ts` file acts as a human-readable regression suite and documents the exact wire bytes expected from the reference implementation.

### Integration with PassthroughModem

Property tests import `buildFrame` and `decodeFrame` directly; they do NOT go through `src/modem/`. The `PassthroughModem` (defined in `src/modem/`) is used only by `src/app/` integration tests that test the full send/receive cycle, which is outside this spec's scope.

---

## Non-Goals

This spec covers `src/protocol/` only. The following are explicitly out of scope:

- **Compression / decompression** (`src/pipeline/`): Out of scope because it belongs to a different layer (`src/pipeline/`), not because of a Node API limitation. Node 22 ships `CompressionStream` natively.
- **Encryption / decryption** (`src/pipeline/`): Out of scope because it belongs to a different layer (`src/pipeline/`), not because of a Node API limitation. Node 22 ships the Web Crypto API natively.
- **Card serialisation / parsing** (`src/pipeline/`): That is the `04-cards` spec.
- **Broadcast carousel** (3-repeat cycle): That is the `05-broadcast` spec; `splitter.ts` returns frames once and the caller decides repetition.
- **Audio I/O** (`src/audio/`): Zero references to Web Audio API.
- **UI** (`src/ui/`): Zero references to Preact or DOM.
- **IndexedDB** (`src/store/`): The Reassembler is in-memory; persistence is the `06-storage` spec.
- **Repair-request frame handling**: The frame type constant and struct are defined here (completeness), but the duplex-repair state machine is a stretch-goal spec.
- **Call mode** (`DT_FASTEST` / low-frequency protocol): Modem protocol selection lives in `src/modem/`.
