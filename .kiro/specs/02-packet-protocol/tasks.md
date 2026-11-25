# Implementation Plan: Packet Protocol (`src/protocol/`)

## Overview

Implements the pure-TypeScript packet protocol layer: constants, whitening, CRC utilities, frame encoder/decoder, manifest serialiser/parser, splitter, reassembler, and replay guard. Every module is a leaf — no DOM, Web Audio, or IndexedDB. Tests run entirely in Node via Vitest + fast-check.

## Tasks

- [x] 1. Create `src/protocol/constants.ts` and `src/protocol/types.ts`
  - Export `MAX_FRAME = 128`, `MIN_FRAME = 12`, `MAGIC = 0x57`, `VERSION = 1`, frame-type constants (`FRAME_TYPE_MANIFEST = 0`, `FRAME_TYPE_DATA = 1`, `FRAME_TYPE_REPAIR_REQUEST = 2`), and `REPLAY_WINDOW_MS = 10 * 60 * 1000` from `constants.ts`
  - Define all shared TypeScript interfaces and type aliases in `types.ts`: `RngSource`, `FrameFields`, `EncoderOptions`, `EncodeResult`, `BaseDecodedFrame`, `ManifestFrame`, `DataFrame`, `RepairRequestFrame`, `DecodedFrame` (discriminated union), `FrameKind`, `ManifestFlags`, `PlainManifestBody`, `LockedManifestBody`, `ManifestBody`, `ManifestParseResult`, `SplitOptions`, `SplitResult`, `ReassemblerOptions`, `ReassemblyResult`
  - `types.ts` imports only from `constants.ts`; neither file imports from outside `src/protocol/`
  - _Requirements: 1.1, 1.2, 2.8_

- [x] 2. Implement whitening
  - [x] 2.1 Create `src/protocol/whiten.ts`
    - Implement `whiten(bytes: Uint8Array, salt: number): Uint8Array` using the xorshift32 stream: seed `= (0x57A11 ^ Math.imul(salt, 0x9E3779B1)) >>> 0 || 1`, per-byte `s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; out[i] = bytes[i] ^ (s & 0xff)`
    - Returns a new `Uint8Array`; never mutates input
    - Seed value `0` is replaced with `1`
    - _Requirements: 2.1, 2.2, 2.6, 3.1_

  - [x]* 2.2 Write property test `tests/protocol/R3.whiten-involution.prop.test.ts`
    - **Property 1: Whitening involution** — for any `Uint8Array` and any salt in [0, 255], `whiten(whiten(x, salt), salt)` equals `x`
    - Arbitraries: `fc.uint8Array({ minLength: 0, maxLength: 200 })` and `fc.integer({ min: 0, max: 255 })`
    - `numRuns: 1000`
    - **Validates: Requirements 2.6**

- [x] 3. Implement CRC utilities
  - [x] 3.1 Create `src/protocol/crc16.ts`
    - Implement `crc16(bytes: Uint8Array): number` using a 256-entry lookup table generated at module load
    - Poly `0x1021`, init `0xFFFF`, no input/output reflection (CRC-16/CCITT-FALSE / CRC-16/IBM-3740)
    - Returns an unsigned 16-bit integer
    - No new runtime dependency — implemented from scratch
    - _Requirements: 2.2, 3.2_

  - [x] 3.2 Create `src/protocol/crc32.ts`
    - Implement `crc32(bytes: Uint8Array): number` using a 256-entry lookup table generated at module load
    - Reflected poly `0xEDB88320`, init `0xFFFFFFFF`, final XOR `0xFFFFFFFF` (ISO 3309 / IEEE 802.3)
    - Returns an unsigned 32-bit integer
    - No new runtime dependency — implemented from scratch
    - _Requirements: 4.4, 6.1_

- [x] 4. Implement frame encoder
  - [x] 4.1 Create `src/protocol/frame-encoder.ts`
    - Implement `buildFrame(fields: FrameFields, options?: EncoderOptions): EncodeResult`
    - Wire layout: `salt (1, clear) | whitened[ magic (1) | version+type (1) | message_id (2 LE) | seq (1) | body (zero-padded) | crc16 (2 LE) ]`
    - CRC-16 is computed over the un-whitened `magic..body` region, appended, then the entire region `[1..end]` is whitened
    - Return `{ ok: false, error: 'body-too-large' }` if `body.length > 120`; `{ ok: false, error: 'frame-too-large' }` if total frame would exceed `MAX_FRAME`
    - Zero-pad body so total frame ≥ `MIN_FRAME`
    - Default RNG uses `crypto.getRandomValues`; injectable via `options.rng`
    - Implement `resaltFrame(frame: Uint8Array, newSalt: number): Uint8Array`: dewhiten with old salt (byte 0), write newSalt at index 0, rewhiten with newSalt — returns a new `Uint8Array`
    - _Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_

  - [x] 4.2 Create `src/protocol/frame-decoder.ts`
    - Implement `decodeFrame(bytes: Uint8Array): DecodedFrame | null` following the 12-step algorithm in the design
    - Reject if `bytes.length < MIN_FRAME` or `bytes.length > MAX_FRAME`
    - Extract salt from byte 0, dewhiten bytes 1.. with that salt
    - Recompute CRC-16 over dewhitened `magic..body`; return `null` on mismatch
    - Return `null` if dewhitened magic ≠ `0x57`, version nibble ≠ 1, or type nibble ∉ {0, 1, 2}
    - Return `null` if `type === 0` (manifest) and `seq !== 0`, or `type === 1` (data) and `seq === 0`
    - Return typed `DecodedFrame` on success
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x]* 4.3 Write property test `tests/protocol/R3.decoder-drop.prop.test.ts`
    - **Property 2: Single-byte corruption drops frame** — for any valid encoded frame, flipping any single byte in the whitened region (index ≥ 1) makes `decodeFrame` return `null`
    - Arbitraries: generate a valid frame via `buildFrame` with deterministic RNG, then pick a random index ≥ 1 and XOR with a random non-zero mask
    - `numRuns: 1000`
    - **Validates: Requirements 3.6, 3.3**

  - [x]* 4.4 Write property test `tests/protocol/R1.resalt.prop.test.ts`
    - **Property 11: resaltFrame correctness** — `resaltFrame(frame, newSalt)` produces byte 0 = `newSalt` and `decodeFrame(resaltFrame(frame, newSalt))` returns fields identical to `decodeFrame(frame)`
    - Filter cases where `newSalt === frame[0]` to ensure the salt actually changes
    - `numRuns: 1000`
    - **Validates: Requirements 2.5, 2.8**

- [x] 5. Checkpoint — Ensure all tests pass
  - Run `npx vitest run tests/protocol/` and confirm no failures before proceeding. Ask the user if any test fails.

- [x] 6. Implement manifest serialiser/parser
  - [x] 6.1 Create `src/protocol/manifest.ts`
    - Implement `serializeManifest(body: ManifestBody): Uint8Array`
    - Layout (LE): `total_frames (1) | kind (1) | flags (1) | payload_len (2) | crc32 (4)` = 9 bytes plain; append `enc_salt (16) | iv (12)` = 37 bytes locked
    - Implement `parseManifest(bytes: Uint8Array): ManifestParseResult`
    - Return `{ ok: false, error: 'too-short' }` if `bytes.length < 9`; `{ ok: false, error: 'unknown-kind' }` if `kind > 4`
    - Does not throw on invalid input
    - _Requirements: 4.1, 4.2, 8.1, 8.2, 8.4_

  - [x]* 6.2 Write property test `tests/protocol/R8.manifest-round-trip.prop.test.ts`
    - **Property 10: Manifest round-trip** — for any valid `ManifestBody` (plain or locked), `parseManifest(serializeManifest(body))` returns `{ ok: true, value }` where all fields equal the original
    - Arbitraries: `fc.record` for `PlainManifestBody`; `fc.record` with `encSalt` (`fc.uint8Array({ minLength: 16, maxLength: 16 })`) and `iv` (`fc.uint8Array({ minLength: 12, maxLength: 12 })`) for locked
    - `numRuns: 1000`
    - **Validates: Requirements 8.3, 8.2**

- [x] 7. Implement payload splitter
  - [x] 7.1 Create `src/protocol/splitter.ts`
    - Implement `splitPayload(payload: Uint8Array, options: SplitOptions): SplitResult`
    - `chunkSize = MAX_FRAME - 8` (= 120); split payload into chunks of that size
    - Return `{ ok: false, error: 'payload-too-large' }` if chunks would exceed 255
    - Compute `crc32(payload)` and embed in `ManifestBody`
    - Build manifest frame with `buildFrame({ type: 0, seq: 0, body: serializeManifest(...) })`
    - Build data frames with `buildFrame({ type: 1, seq: i, body: chunk })` for `i` in 1..total_frames
    - Generate `messageId` via `rng()` (2 bytes combined) unless overridden in options
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x]* 7.2 Write property test `tests/protocol/R1.frame-bounds.prop.test.ts`
    - **Property 4: Frame-length bounds** — for any payload of 0–2048 bytes, every frame from `splitPayload` has `MIN_FRAME ≤ length ≤ MAX_FRAME`
    - `numRuns: 1000`
    - **Validates: Requirements 2.7, 4.7, 1.3, 1.4**

- [x] 8. Implement replay guard
  - [x] 8.1 Create `src/protocol/replay-guard.ts`
    - Implement `ReplayGuard` class with `has(messageId: number): boolean` and `record(messageId: number): void`
    - Internal state: `Map<number, number>` (messageId → recorded_at_ms)
    - Lazy eviction in `record()`: sweep and delete entries where `clock() - recorded_at > REPLAY_WINDOW_MS`
    - Constructor accepts optional `clock?: () => number` (default `Date.now`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 9. Implement reassembler
  - [x] 9.1 Create `src/protocol/reassembler.ts`
    - Implement `createReassembler(options?: ReassemblerOptions)` returning `{ feed(frame: DecodedFrame): ReassemblyResult; expireStale(): void }`
    - Per-transfer state: `manifest: ManifestBody | null`, `frames: Map<number, Uint8Array>`, `lastSeen: number`
    - Late-joiner path: data frames arriving before the manifest are buffered under `message_id`; when the manifest arrives check for immediate completeness
    - Duplicate frames (same `seq` for same `message_id`) are silently ignored — first copy wins
    - Repair-request frames (`type === 2`) return `{ status: 'incomplete' }` without modifying any transfer state
    - On completeness: join data-frame bodies in seq order, trim to `manifest.payloadLen`, verify CRC-32
    - On CRC-32 pass: call `replayGuard.record(messageId)`, delete transfer entry, return `{ status: 'complete', payload }`
    - On CRC-32 fail: clear frames map, set manifest to null, reset `lastSeen` to current clock — return `{ status: 'crc-fail' }`
    - On replay-guard hit: return `{ status: 'replayed' }`
    - Lazy stale-transfer sweep on every `feed()` call: delete entries where `clock() - lastSeen > REPLAY_WINDOW_MS`
    - Accept `options.clock` (default `Date.now`) and `options.replayGuard` (create a new `ReplayGuard(clock)` if absent)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 7.1, 7.2, 7.5_

  - [x]* 9.2 Write property test `tests/protocol/R1.round-trip.prop.test.ts`
    - **Property 3: Payload round-trip** — for any `Uint8Array` of 0–2048 bytes, split with `splitPayload`, decoded with `decodeFrame`, fed to `reassembler.feed` returns a payload byte-for-byte equal to the original
    - Use deterministic RNG for `buildFrame`; `numRuns: 1000`
    - **Validates: Requirements 4.6, 5.4, 5.5, 6.2**

  - [x]* 9.3 Write property test `tests/protocol/R3.order-independent.prop.test.ts`
    - **Property 5: Order-independence and duplicate-tolerance** — shuffling the frame list into any order and inserting arbitrary duplicates before feeding to the Reassembler produces the same payload as the original order
    - Arbitraries: `fc.shuffledSubarray` on the frame list; `fc.array` with repeats inserted
    - `numRuns: 1000`
    - **Validates: Requirements 5.6, 5.2**

  - [x]* 9.4 Write property test `tests/protocol/R4.missing-frame.prop.test.ts`
    - **Property 6: Incomplete frame set never yields bytes** — removing at least one data frame or the manifest from any valid frame set, the Reassembler never returns `{ status: 'complete' }`
    - `numRuns: 1000`
    - **Validates: Requirements 5.7, 4.3**

  - [x]* 9.5 Write property test `tests/protocol/R3.crc32-flip.prop.test.ts`
    - **Property 7: CRC-32 flip rejection** — for any reassembled payload with exactly one byte flipped at any position, the Reassembler returns `{ status: 'crc-fail' }` and no bytes are exposed
    - `numRuns: 1000`
    - **Validates: Requirements 6.4, 6.3**

  - [x]* 9.6 Write property test `tests/protocol/R3.late-manifest.prop.test.ts`
    - **Property 9: Late-manifest delivery** — feeding data frames first and manifest last returns the same payload as feeding the manifest first
    - `numRuns: 1000`
    - **Validates: Requirements 5.1, 5.3**

  - [x]* 9.7 Write property test `tests/protocol/R13.replay-guard.prop.test.ts`
    - **Property 8: Replay guard suppresses re-delivery** — after a successful delivery, feeding the same frames again within the 10-minute window returns `{ status: 'replayed' }`; after the clock advances past 10 minutes, feeding them returns `{ status: 'complete' }`
    - Use injected clock returning controlled timestamps
    - `numRuns: 1000`
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 10. Create barrel `src/protocol/index.ts`
  - Re-export the full public API surface: `MAX_FRAME`, `MIN_FRAME`, `whiten`, `crc16`, `crc32`, `buildFrame`, `resaltFrame`, `decodeFrame`, `serializeManifest`, `parseManifest`, `splitPayload`, `createReassembler`, `ReplayGuard`
  - Re-export all types from `types.ts`
  - No implementation logic in this file
  - _Requirements: 1.1, 1.2_

- [x] 11. Write unit tests `tests/protocol/protocol.test.ts`
  - [x] 11.1 Write example-based unit tests for constants, whitening, CRC utilities
    - Verify `MAX_FRAME === 128` and `MIN_FRAME === 12`
    - Verify `crc16` and `crc32` return known-correct values for a fixed input (use a reference vector, e.g. `crc16(Uint8Array.from([0x57]))`)
    - Verify `whiten` reference output matches the vector in `tests/ggwave-baseline.test.ts`
    - _Requirements: 1.1, 1.2, 2.6_

  - [x] 11.2 Write example-based unit tests for frame encoder and decoder
    - Verify encoder produces the exact byte sequence expected by the reference whitening algorithm
    - Verify `decodeFrame` returns `null` for a manifest frame with `seq ≠ 0`
    - Verify `decodeFrame` returns `null` for a data frame with `seq === 0`
    - Verify `decodeFrame` returns `null` for a frame shorter than `MIN_FRAME`
    - Verify `decodeFrame` returns `null` for a frame longer than `MAX_FRAME`
    - Verify `resaltFrame` produces byte 0 equal to the new salt and decodes to the same fields as the original
    - _Requirements: 2.3, 2.4, 3.3, 3.4, 3.7_

  - [x] 11.3 Write example-based unit tests for manifest parser and splitter
    - Verify `parseManifest` returns `{ ok: false, error: 'too-short' }` for a byte array shorter than 9 bytes
    - Verify `parseManifest` returns `{ ok: false, error: 'unknown-kind' }` for `kind = 5`
    - Verify `splitPayload` returns `{ ok: false, error: 'payload-too-large' }` for a payload requiring 256 chunks (> 255 × 120 bytes)
    - _Requirements: 4.5, 8.4_

  - [x] 11.4 Write example-based unit tests for reassembler and replay guard
    - Verify a known-good frame set round-trips to exact payload bytes
    - Verify `createReassembler` with injected clock returns `{ status: 'replayed' }` on second delivery
    - _Requirements: 5.4, 7.1, 7.2_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Run `npx vitest run tests/protocol/` and confirm all implementation tasks and optional tests pass. Ask the user if any test fails.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but each one enforces a protocol invariant from `docs/planning/06-architecture.md`
- Each task references specific requirements for traceability; `Rn.m` refers to Requirement n, criterion m in `requirements.md`
- All property tests use `numRuns: 1000` and a deterministic RNG injected via `EncoderOptions.rng` — no real ggwave or audio needed
- CRC-16 and CRC-32 are implemented from scratch (lookup tables); no new runtime dependency is added
- `src/protocol/types.ts` exists solely to avoid circular imports between encoder, decoder, reassembler, and splitter
- The barrel `index.ts` re-exports from `types.ts`; callers that only need types can import directly from `src/protocol/types.js`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4"] },
    { "id": 6, "tasks": ["5"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "7.1"] },
    { "id": 9, "tasks": ["7.2", "8.1"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] },
    { "id": 12, "tasks": ["10"] },
    { "id": 13, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 14, "tasks": ["12"] }
  ]
}
```
