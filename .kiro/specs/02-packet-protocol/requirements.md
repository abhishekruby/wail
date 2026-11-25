# Requirements Document

## Introduction

The packet protocol layer (`src/protocol/`) is the pure-TypeScript core of Wail's over-the-air framing. It encodes a byte payload into one or more frames, each carrying a 1-byte salt (clear), a whitened body, and a CRC-16; decodes received frames with CRC-16 verification; reassembles frames into the original payload in any arrival order; validates the reassembled payload with a CRC-32; and ignores replayed messages via a 10-minute replay guard.

This layer has no dependency on the DOM, Web Audio, or IndexedDB. All behaviour is deterministic and testable in Node. Frame size constants (`MAX_FRAME = 128`, `MIN_FRAME = 12`) live exclusively in `src/protocol/constants.ts`.

Sources of truth: `docs/planning/04-prd.md` (R1, R3, R4, R13), `docs/planning/06-architecture.md` (P1–P4, P10), `.kiro/steering/protocol.md`.

---

## Glossary

- **Frame**: A single over-the-air unit, 12–128 bytes. Layout: `salt (1) | magic (1) | version+type (1) | message_id (2) | seq (1) | body (≤120) | crc16 (2)`.
- **Manifest frame**: The frame with `seq = 0`. Its body carries metadata about the message: `total_frames`, `kind`, `flags`, `payload_len`, `crc32`, and (when locked) `salt + iv`.
- **Data frame**: A frame with `seq ≥ 1`. Its body carries a chunk of the message payload.
- **salt**: A 1-byte value prepended to a frame in the clear. It seeds the whitening stream and changes on every repeat of the same frame.
- **Whitening**: XOR of every byte after `salt` with an xorshift32 pseudo-random stream seeded by `(0x57A11 ^ salt * 0x9E3779B1)`. Makes byte patterns high-entropy so ggwave does not silently corrupt them.
- **magic**: The byte `0x57` ("W"), placed at the start of the whitened region.
- **version+type**: One byte. High nibble = protocol version (1). Low nibble = frame type: `0` manifest, `1` data, `2` repair-request.
- **message_id**: 2-byte random identifier, the same for every frame of one message.
- **seq**: 1-byte sequence number. `0` for the manifest; `1..255` for data frames in order.
- **CRC-16**: CRC-16/CCITT-FALSE computed over the un-whitened bytes from `magic` through the end of `body` (before `crc16` itself). The 2-byte result is appended to the pre-whitening region and then whitened together with the rest of the frame. On decode, the entire region after `salt` is dewhitened first, then the CRC is verified over the dewhitened `magic`..`body` bytes.
- **CRC-32**: ISO 3309 / IEEE 802.3 CRC computed over the complete reassembled payload. A mismatch causes the message to be discarded.
- **Encoder**: The module that builds frames from a payload.
- **Decoder**: The module that validates and strips a frame's outer envelope, returning its body.
- **Reassembler**: The module that collects frames by `message_id`, detects completeness, and joins them.
- **ReplayGuard**: The module that tracks recently completed `message_id` values and suppresses duplicates within a 10-minute window.
- **PassthroughModem**: A test double (defined in `src/modem/`) that returns encoded bytes directly to the caller without real audio. Used in protocol tests only.
- **MAX_FRAME**: `128` — the maximum frame length in bytes, defined in `src/protocol/constants.ts`.
- **MIN_FRAME**: `12` — the minimum frame length in bytes, defined in `src/protocol/constants.ts`.

---

## Requirements

### Requirement 1: Frame constants

**User Story:** As a protocol implementer, I want all frame size bounds in one place, so that every module uses the same limits without duplication.

#### Acceptance Criteria

1. THE `constants.ts` module SHALL export `MAX_FRAME` as the integer `128`.
2. THE `constants.ts` module SHALL export `MIN_FRAME` as the integer `12`.
3. THE Encoder SHALL refuse to build a frame whose total length would exceed `MAX_FRAME`, returning an error.
4. THE Encoder SHALL zero-pad `body` so that every built frame is at least `MIN_FRAME` bytes long.

---

### Requirement 2: Frame encoding — whitening and CRC-16 (R1, P10)

**User Story:** As a sender, I want each frame whitened and integrity-protected, so that ggwave's silent-corruption failure mode is neutralised before transmission.

#### Acceptance Criteria

1. WHEN the Encoder builds a frame, THE Encoder SHALL place `salt` as the first byte in the clear (not whitened).
2. WHEN the Encoder builds a frame, THE Encoder SHALL compute CRC-16/CCITT-FALSE over the **un-whitened** bytes from `magic` through the end of `body`, append the 2-byte result (little-endian) to form the pre-whitening region `magic | version+type | message_id | seq | body | crc16`, then whiten **every byte** in that entire region (including `crc16`) using the xorshift32 stream seeded by `(0x57A11 ^ salt * 0x9E3779B1)`, discarding seed value `0` (replace with `1`).
3. WHEN the Encoder builds a frame, THE Encoder SHALL set `magic` to `0x57` before whitening.
4. WHEN the Encoder builds a frame, THE Encoder SHALL set the high nibble of `version+type` to `1` and the low nibble to the frame type (`0` manifest, `1` data).
5. WHEN the Encoder builds a repeated frame, THE Encoder SHALL use a fresh `salt` value different from the salt used in the previous repeat of the same frame.
6. FOR ALL frames built by the Encoder with any `salt` value, applying whitening twice with the same `salt` SHALL return the original byte sequence (involution property).
7. FOR ALL frames built by the Encoder, the frame length SHALL be greater than or equal to `MIN_FRAME` and less than or equal to `MAX_FRAME`.
8. THE Encoder SHALL accept an injectable random-byte source (a function `() => number` that returns values `0–255`) used for generating `salt` and `message_id` values, so that property tests can supply deterministic inputs.

---

### Requirement 3: Frame decoding and CRC-16 rejection (R3, R4, P9)

**User Story:** As a receiver, I want corrupt frames silently dropped before they reach the reassembler, so that wrong bytes from ggwave never propagate.

#### Acceptance Criteria

1. WHEN the Decoder receives a frame, THE Decoder SHALL first dewhiten every byte after `salt` (from `magic` through `crc16`) using the xorshift32 stream seeded from `salt`.
2. WHEN the Decoder has dewhitened the frame, THE Decoder SHALL recompute CRC-16/CCITT-FALSE over the dewhitened bytes from `magic` through the end of `body` (excluding `crc16`) and compare it to the dewhitened `crc16` field.
3. IF the computed CRC-16 does not match, THEN THE Decoder SHALL drop the frame and return nothing.
4. WHEN the CRC-16 passes, THE Decoder SHALL verify that the dewhitened `magic` byte equals `0x57`; if it does not, THE Decoder SHALL drop the frame and return nothing.
5. WHEN decoding succeeds, THE Decoder SHALL return the dewhitened fields: `magic`, `version`, `type`, `message_id`, `seq`, and `body` as separate typed values.
6. FOR ALL valid encoded frames, changing any single byte at any position after `salt` (i.e. in the whitened region) SHALL cause THE Decoder to drop the frame (single-byte-corruption detection property).
7. THE Decoder SHALL drop a frame and return nothing if the frame byte-length is less than `MIN_FRAME`, greater than `MAX_FRAME`, or if the dewhitened `version` nibble is not `1`, or if the dewhitened `type` nibble is not one of `{0, 1, 2}`.

---

### Requirement 4: Payload splitting into frames (R1, P10)

**User Story:** As a sender, I want a payload of any size up to the maximum split into a manifest plus data frames automatically, so that I only provide bytes and get back a frame list.

#### Acceptance Criteria

1. WHEN the Encoder splits a payload, THE Encoder SHALL produce exactly one manifest frame (`seq = 0`) whose body contains `total_frames`, `kind`, `flags`, `payload_len`, and `crc32` of the payload.
2. WHEN the payload is locked, THE Encoder SHALL also include the encryption `salt` (16 bytes) and `iv` (12 bytes) in the manifest body.
3. WHEN the Encoder splits a payload, THE Encoder SHALL produce one data frame per chunk, with `seq` values `1` through `total_frames` in order.
4. WHEN the Encoder splits a payload, THE Encoder SHALL compute CRC-32 over the full payload and store it in the manifest body before splitting.
5. WHEN the Encoder splits a payload, THE Encoder SHALL return an error if the payload would require more than 255 data frames.
6. FOR ALL payloads of 0 to 2,048 bytes split by the Encoder and then reassembled by the Reassembler, THE system SHALL produce a byte sequence equal to the original payload (round-trip property, P1).
7. FOR ALL payloads split by the Encoder, every resulting frame SHALL satisfy `MIN_FRAME ≤ length ≤ MAX_FRAME` (P10).

---

### Requirement 5: Order-independent reassembly (R3, R4, P2, P3)

**User Story:** As a receiver in a broadcast environment, I want frames to be accepted in any order and duplicates ignored, so that late joins and repeated cycles work correctly.

#### Acceptance Criteria

1. WHEN the Reassembler receives a data frame (`seq ≥ 1`) for a `message_id` whose manifest has not yet arrived, THE Reassembler SHALL buffer that frame and retain it until the manifest arrives or the transfer times out.
2. WHEN the Reassembler receives a frame with a known `message_id`, THE Reassembler SHALL store it keyed by `seq`; a duplicate `seq` is ignored (the first copy that passed CRC-16 is kept).
3. WHEN the manifest frame (`seq = 0`) for a `message_id` arrives, THE Reassembler SHALL use `total_frames` from its body to determine completeness, including any data frames already buffered.
4. WHEN the Reassembler has received the manifest frame and every data frame `seq 1..total_frames`, THE Reassembler SHALL declare the message complete.
5. WHEN the message is complete, THE Reassembler SHALL join data-frame bodies in `seq` order, then trim the joined bytes to `payload_len` as recorded in the manifest, to reconstruct the payload.
6. FOR ALL frame orderings and duplicates of a valid frame set, including all orderings where data frames arrive before the manifest, THE Reassembler SHALL produce the same payload (order-independence, duplicate-tolerance, and late-manifest property — covers P1, P2).
7. WHILE the manifest has not arrived or one or more data-frame `seq` values `1..total_frames` are absent, THE Reassembler SHALL report the message as incomplete and SHALL NOT return any payload bytes (P3).
8. THE Reassembler SHALL drop a transfer — freeing all buffered frames for that `message_id` — 10 minutes after the last frame for that transfer was received, using an injected clock (see Requirement 7, criterion 4).

---

### Requirement 6: Message CRC-32 verification (R3, R4, P4)

**User Story:** As a receiver, I want the reassembled payload verified against the CRC-32 in the manifest, so that any bit error that survives the per-frame CRC-16 is still caught before the message is shown.

#### Acceptance Criteria

1. WHEN the Reassembler completes a message, THE Reassembler SHALL compute CRC-32 over the joined payload and compare it to the value stored in the manifest body.
2. IF the CRC-32 check passes, THEN THE Reassembler SHALL return the payload to the caller as a valid message.
3. IF the CRC-32 check fails, THEN THE Reassembler SHALL discard the payload and return a failure indicator, with no bytes exposed to the caller.
4. FOR ALL reassembled payloads with exactly one byte flipped anywhere, THE Reassembler SHALL reject the message via the CRC-32 check (single-bit-error rejection, P4).

---

### Requirement 7: Replay guard (R13)

**User Story:** As a receiver in a broadcast loop, I want messages I already decoded in the last 10 minutes ignored, so that the same message is not shown to the user again during repeated broadcast cycles.

#### Acceptance Criteria

1. WHEN the Reassembler successfully delivers a message, THE ReplayGuard SHALL record the `message_id` with a timestamp.
2. WHEN the Reassembler encounters a `message_id` that the ReplayGuard has recorded within the last 10 minutes, THE Reassembler SHALL discard all frames for that `message_id` without delivering the message.
3. WHEN 10 minutes have elapsed since a `message_id` was recorded, THE ReplayGuard SHALL remove it from the guard set so the same `message_id` can be accepted again.
4. THE ReplayGuard SHALL accept an injectable clock (a function `() => number` returning the current time in milliseconds) used for all timestamp comparisons, so that property tests can advance time deterministically without real wall-clock delays.
5. THE Reassembler SHALL use the same injected clock (passed through from the top-level API) for both the replay guard and the transfer-expiry check described in Requirement 5, criterion 8, ensuring a single clock controls all time-dependent behaviour.

---

### Requirement 8: Parser/serialiser round-trip for manifest body

**User Story:** As a protocol developer, I want the manifest body serialiser and parser verified as strict inverses, so that metadata fields are never silently truncated or misaligned.

#### Acceptance Criteria

1. THE ManifestSerializer SHALL serialise a manifest object (containing `total_frames`, `kind`, `flags`, `payload_len`, `crc32`, and optionally `salt` + `iv`) into a `Uint8Array` of at most 37 bytes.
2. THE ManifestParser SHALL parse a `Uint8Array` produced by `ManifestSerializer` into a manifest object equal to the original.
3. FOR ALL valid manifest objects, parsing the serialised output SHALL return an object whose fields equal the original (round-trip property).
4. IF a `Uint8Array` is shorter than the minimum manifest body length or contains an unrecognised `kind` value, THEN THE ManifestParser SHALL return a parse-error result without throwing.
