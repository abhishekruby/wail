# Requirements Document

## Introduction

The modem-core layer (`src/modem/`) is the interface between Wail's pure protocol layer and the physical audio hardware. It encodes frames as audio waveforms via ggwave, decodes received samples back to frames, and provides type-safe configuration for modulation speed and volume. The layer is split into three concerns:

1. **Modem interface** (`modem.ts`): Type-safe abstraction over any modem implementation (ggwave or test double).
2. **GgwaveModem** (`ggwave-modem.ts`): Production implementation using the ggwave WASM library.
3. **PassthroughModem** (`passthrough-modem.ts`): Test double for protocol testing without audio.
4. **Modem configuration** (`modem-config.ts`): Speed and volume settings with validation.

The modem layer is not tested in Node (audio hardware is unavailable); it is thin by design — logic is kept in `src/protocol/` and `src/app/`, not here.

Sources of truth: R2 and R10 in `docs/planning/04-prd.md`; "The seam between our code and ggwave" (Modem interface) and Transfer modes in `docs/planning/06-architecture.md`; `.kiro/steering/audio-dsp.md`, `tech.md` and `protocol.md`; `src/ggwave.d.ts`; lab facts in `docs/field-tests.md`, `docs/research/carousel-sim.md` and `docs/research/codec-sim.md`; how `tests/ggwave-baseline.test.ts` drives ggwave in Node.

---

## Glossary

- **ggwave**: The WASM modem library (npm package, MIT). Encodes frames to Float32 audio and decodes samples back to frames.
- **Modem**: Any object that implements the `Modem` interface (encode → audio, feed → frames). Both production `GgwaveModem` and test double `PassthroughModem` implement it.
- **Frame**: A `Uint8Array` of 12–128 bytes carrying one over-the-air unit.
- **Float32Array**: Raw PCM audio samples in the range [−1, +1]. All Wail audio is mono PCM at the sample rate of the AudioContext.
- **Sample rate**: Frames per second of the PCM stream. Android Chrome typically uses 48 kHz. Passed once at modem creation and never changes during a session.
- **Speed**: Either `'normal'` or `'fast'`. Maps to ggwave protocol constants `GGWAVE_PROTOCOL_AUDIBLE_NORMAL` or `GGWAVE_PROTOCOL_AUDIBLE_FAST`. Do NOT use `GGWAVE_PROTOCOL_AUDIBLE_FASTEST` for room broadcast (fails room echo at RT60 0.5 s).
- **Volume**: An integer in [1, 100]. Controls the amplitude of the encoded waveform. Default is 10 (quiet). Used when calling ggwave's `encode`.
- **Call mode**: Reserved slot for `DT_FASTEST` at volume 50 for future research; NOT implemented in this spec. Marked in `modem-config.ts` with a TODO comment.
- **Factory pattern**: `GgwaveModem` is created via async static factory `static async create(config): Promise<GgwaveModem>` and a private constructor, because the ggwave factory is async (`await factory()`). One instance per session.
- **MAX_FRAME**: 128 bytes. The maximum frame size ggwave can encode/decode safely. ggwave's hard limit is 140, but we reserve headroom.
- **Feed**: The operation of passing received audio samples to the modem for decoding. Each call to `feed` accepts a block of Float32 samples (possibly shorter or longer than a single frame's air time). The modem buffers incomplete frames and returns a list of decoded frames as they become complete.
- **WASM memory**: ggwave allocates encode/decode buffers inside the WASM linear memory. All outputs from ggwave are views into this shared memory and must be copied before the next ggwave call.

---

## Requirements

### Requirement 1: Modem interface (R2)

**User Story:** As an app-layer developer, I want a type-safe, implementation-agnostic interface to encode frames and decode audio, so that I can swap between ggwave and test doubles without coupling my code to either.

#### Acceptance Criteria

1. THERE SHALL be an interface `Modem` with two methods:
   - `encode(frame: Uint8Array): EncodeAudioResult` — Takes a frame and returns either `{ ok: true; samples: Float32Array }` or `{ ok: false; error: 'frame-too-large' | 'empty-frame' }`.
   - `feed(samples: Float32Array): Uint8Array[]` — Takes a block of received audio samples and returns a list of decoded frames (zero or more). May return an empty list if no frame is complete yet.
2. THE `encode` method SHALL accept frames of 12–128 bytes (enforced by the protocol layer, but the modem SHALL validate). It SHALL return Float32 samples with amplitude in [−1, +1] on success, or an error result on failure.
3. THE `feed` method SHALL accept Float32 blocks of **any length** (64 to 4,096 samples or more) and handle frames that span multiple blocks internally. The caller does not need to know the frame's air time.
4. THE `feed` method SHALL return frames in the order they became complete (timestamp-independent; a frame buffered for the manifest can be completed before an earlier data frame).
5. THE `Modem` interface SHALL NOT throw exceptions for invalid input; instead, callers receive either an error result or an empty decode list. The only exceptions thrown are from JavaScript internals (e.g., `RangeError` on out-of-bounds array access), which are the caller's responsibility to handle.
6. BOTH `encode` and `feed` are **synchronous** (not async). They must complete immediately (ggwave's C++ backend is synchronous).

---

### Requirement 2: GgwaveModem implementation (R2, R10)

**User Story:** As a sender or receiver, I want ggwave's modem capability used to send my frames as sound and decode received sound back to frames, with full error handling and WASM memory safety.

#### Acceptance Criteria

1. WHEN `GgwaveModem` is created via `static async create(config: GgwaveModemConfig): Promise<GgwaveModem>`, it SHALL:
   - Validate that `config.sampleRate > 0` (typically 48,000 or 44,100).
   - Validate that `config.speed` is either `'normal'` or `'fast'`.
   - Validate that `config.volume` is an integer in [1, 100].
   - Await `const gg = await factory()` to get the ggwave module from WASM.
   - Call `gg.disableLog()` to suppress debug output.
   - Call `const p = gg.getDefaultParameters()` to get the default parameters object.
   - Set sample rate: `p.sampleRateInp = config.sampleRate; p.sampleRateOut = config.sampleRate`.
   - Map speed to protocol ID: `'normal'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL`, `'fast'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST`.
   - Create instance: `const inst = gg.init(p)`.
   - **Calculate chunk size**: `const chunkBytes = p.samplesPerFrame * 4` (1024 samples × 4 bytes per Float32 = 4096 bytes at 48 kHz). This is the exact block size ggwave's decode() requires.
   - Initialize pending buffer: `pending = new Int8Array(0)`.
   - Store `gg`, `inst`, `config`, `protocolId`, `chunkBytes`, and `pending` for later use.
   - Return a new `GgwaveModem` instance with a private constructor (async factory pattern).

2. WHEN `encode(frame: Uint8Array)` is called on a GgwaveModem instance:
   - IF `frame.length > MAX_FRAME` (128) or `frame.length < 1`, RETURN `{ ok: false; error: 'frame-too-large' | 'empty-frame' }`.
   - ELSE, call `const result = gg.encode(inst, frame, this.protocolId, this.config.volume)`, which returns an `Int8Array` view into WASM memory.
   - The Int8Array contains 32-bit float samples interpreted as bytes (the bytes of the IEEE 754 representation, not divided).
   - **BEFORE the next ggwave call**, copy the returned `Int8Array`: `const copy = new Int8Array(result)`.
   - Create a Float32Array from the copied bytes: `const float32 = new Float32Array(copy.buffer)`.
   - Return `{ ok: true; samples: float32 }`.

3. WHEN `feed(samples: Float32Array)` is called on a GgwaveModem instance:
   - Build a byte view: `const int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)` (handles sub-array views).
   - Append the new bytes to the pending buffer.
   - **Feed complete chunks of exactly `chunkBytes` bytes to ggwave's decode()**: ggwave's decode() only works when fed exactly `samplesPerFrame` samples (1024 samples = 4096 bytes at 48 kHz). Feeding fewer or more bytes decodes nothing. While `pending.length >= chunkBytes`, extract a chunk, call `const result = gg.decode(inst, chunk)`, then remove the chunk from pending.
   - For each non-empty result from decode(), **copy immediately**: `const decoded = new Uint8Array(result)` and add to the frames list. Then loop back to check if another frame is ready (ggwave buffers state internally).
   - After processing all complete chunks, return the list of `Uint8Array` frames (possibly empty). Keep the remainder (< `chunkBytes` bytes) in the pending buffer for the next call to `feed()`.
   - Return the list of `Uint8Array` frames (possibly empty).

4. WHEN `reset(): void` is called on a GgwaveModem instance:
   - Clear any partially-buffered samples: `pending = new Int8Array(0)`.
   - This is useful for cleaning up between messages or when the signal is lost and you want to start fresh.

5. THE `GgwaveModem` instance SHALL be **created once per session** (at app startup) via the async factory and reused for the entire send/receive cycle. Do not create a new instance per message or per repeat.

6. NEVER pass more than `MAX_FRAME` (128) bytes to ggwave's `encode`. The ggwave library silently truncates longer input, losing data.

7. NEVER use the Int8Array or Float32Array views returned directly by ggwave; always copy them out of WASM memory before the next ggwave call, because ggwave reuses the same memory region for the next operation.

---

### Requirement 3: PassthroughModem test double (R2)

**User Story:** As a protocol tester, I want a test double that bypasses ggwave and returns frames directly, so that I can test the protocol layer without audio hardware or ggwave latency.

#### Acceptance Criteria

1. WHEN `PassthroughModem` is instantiated, it SHALL accept and ignore configuration (speed, volume) — the test double does not use them.
2. WHEN `encode(frame: Uint8Array)` is called, THE `PassthroughModem` SHALL return `{ ok: true, samples }` where sample i = frame byte i / 255, with the same empty-frame and frame-too-large error handling as `GgwaveModem`.
3. WHEN `feed(samples: Float32Array)` is called, THE `PassthroughModem` SHALL interpret `samples` as already containing encoded frame bytes and attempt to decode them directly:
   - If `samples` is exactly 0 bytes, return an empty list.
   - Else, interpret the Float32 samples as a byte stream (using `new Int8Array(samples.buffer)`) and try to decode the bytes as a frame using the protocol layer's `decodeFrame` function.
   - If a frame is decoded, return it in a list.
   - If decoding fails (CRC mismatch, invalid magic, etc.), return an empty list.
4. MULTIPLE calls to `feed` with partial frame data SHALL buffer internally and return a frame only when enough bytes have accumulated to form one complete frame (12–128 bytes). Once a frame is returned, its bytes are consumed; the next `feed` call starts fresh.
5. THE `PassthroughModem` interface SHALL match `Modem` exactly — it implements the same `encode(frame): Float32Array` and `feed(samples): Uint8Array[]` methods.

---

### Requirement 4: Modem configuration (R10)

**User Story:** As a UI developer, I want to configure the modem's speed (normal vs. fast) and volume (quiet vs. loud), so that I can adapt to room acoustics and user preference.

#### Acceptance Criteria

1. THERE SHALL be a `ModemConfig` type with fields:
   - `speed: 'normal' | 'fast'` (required)
   - `volume: number` (required, validated to be in [1, 100])
   - `sampleRate: number` (required, positive integer, typically 48,000 or 44,100)
   - `callMode?: 'dt-fastest'` (optional, reserved for future research; NOT implemented)

2. THERE SHALL be a validation function `validateModemConfig(config: ModemConfig): ValidResult` that:
   - Returns `{ ok: true }` if all fields are valid.
   - Returns `{ ok: false, error: 'invalid-speed' | 'invalid-volume' | 'invalid-sample-rate' | ... }` on the first validation failure.
   - Never throws; all validation is synchronous.

3. THE default configuration SHOULD be `{ speed: 'normal', volume: 10, sampleRate: 48000 }`.

4. A `callMode` override SHALL be **documented but not implemented** in this spec. It is marked with a TODO comment in `modem-config.ts` for future research. The comment SHALL state: "Call mode `DT_FASTEST` at volume 50 is reserved for research on narrowband call channels (WhatsApp, Telegram, etc.). Not used for room broadcast (fails at RT60 0.5 s). To implement: add conditional logic in `GgwaveModem` to set `protocolId = GGWAVE_PROTOCOL_DT_FASTEST` and enforce `volume = 50`."

5. CONFIGURATION VALIDATION is a pure, synchronous function. It is NOT async and does NOT touch the DOM, Web Audio, or IndexedDB.

---

### Requirement 5: Error handling (R2)

**User Story:** As a caller, I want clear, non-throwing error signals so that I can decide whether to retry, skip, or fail gracefully.

#### Acceptance Criteria

1. IF `encode` receives a frame > `MAX_FRAME`, THE modem SHALL return `{ ok: false; error: 'frame-too-large' }`.
2. IF `encode` receives an empty frame (0 bytes), THE modem SHALL return `{ ok: false; error: 'empty-frame' }`.
3. IF `feed` receives malformed samples, THE modem SHALL return an empty list (no frames decoded) rather than throw.
4. VALIDATION errors (bad config, out-of-range volume) are caught by `validateModemConfig` and returned as error results, never thrown.
5. ggwave C++ exceptions (out of memory, invalid WASM state) are the caller's responsibility to handle. The modem layer does not catch or wrap them.

---

### Requirement 6: WASM memory safety (R2, R10)

**User Story:** As a modem implementer, I want to ensure no memory corruption or buffer leaks when ggwave's encoded/decoded outputs are used, so that the app remains stable.

#### Acceptance Criteria

1. EVERY output from ggwave (both `encode` and `decode`) is a view into WASM linear memory and MUST be copied to a new `Int8Array` or `Uint8Array` before the next ggwave call.
2. IF an output view is not copied and a second ggwave call is made, the original view's bytes may be overwritten by ggwave with new data, causing silent data corruption or crashes.
3. THE `GgwaveModem.feed` method handles multi-block frame reassembly by calling `decode()` in a loop and **copying every result immediately** before continuing the loop.
4. THE modem layer documents this rule with inline comments in `ggwave-modem.ts` so future maintainers understand the WASM memory discipline.

---

### Requirement 7: Sampling and conversion (R2, R10)

**User Story:** As a modem implementer, I want correct audio format conversion between ggwave (Int8 bytes from IEEE 754 float bits) and Web Audio (Float32), so that the encoded waveform has the correct amplitude and the decoded bytes are not mangled.

#### Acceptance Criteria

1. WHEN encoding, ggwave's `encode()` returns samples as 32-bit float values encoded into Int8 bytes (the byte representation of the IEEE 754 bits, not a numeric range). THE `GgwaveModem` SHALL interpret these bytes as a Float32Array by creating `new Float32Array(int8Copy.buffer)`, which reconstructs the original float values.
2. WHEN feeding samples to decode, the Float32Array is reinterpreted as an Int8Array byte view using `new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)`. This is a **bit-reinterpretation**, not a numeric conversion: the bytes of the Float32 representation are read as Int8 (possibly as negative values in the range [−128, +127]).
3. DOCUMENT the byte-reinterpretation in comments so it is clear that this is not a numeric conversion.
4. IN `tests/ggwave-baseline.test.ts`, this conversion is tested: encode a known frame, record the Int8 bytes, verify the round-trip through the byte-reinterpretation path decodes to the same frame.

---

## Correctness Properties

### Property 1: Modem interface consistency

For any frame and any two Modem implementations (GgwaveModem and PassthroughModem), calling `encode(frame)` on both implementations produces outputs that (when passed to `feed` of the other implementation) result in the same decoded frame.

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 3.1**

---

### Property 2: GgwaveModem encode-feed round-trip

For any frame of 12–128 bytes, calling `encode(frame)` and then `feed(encodedWaveform)` on the same GgwaveModem instance returns a list containing exactly that frame.

**Validates: Requirements 2.2, 2.3, 2.5, 6.1, 7.1, 7.2**

---

### Property 3: Multi-block feed assembly

For any encoded waveform, splitting it into random-sized blocks (64 to 4,096 samples each) and calling `feed` sequentially with each block produces the same decoded frame as calling `feed` with the entire waveform in one call.

**Validates: Requirements 1.4, 2.3, 6.1**

---

### Property 4: PassthroughModem frame preservation

For any frame, encoding with PassthroughModem (returns empty Float32Array) and then immediately calling `feed` with the same frame bytes reinterpreted as Float32 returns that frame.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

### Property 5: Oversize frame rejection

For any frame > MAX_FRAME (e.g., 129 bytes), calling `encode(frame)` on GgwaveModem returns `{ ok: false, error: 'frame-too-large' }` and never a silent waveform (ggwave silently truncates, but Wail rejects oversized frames).

**Validates: Requirements 2.5, 5.1**

---

## Non-Goals

This spec covers `src/modem/` only. The following are explicitly out of scope:

- **Audio I/O** (`src/audio/`): Mic capture, playback, analyser. This spec defines the Modem interface, not how audio gets to/from the hardware.
- **Broadcast carousel** (3-repeat cycle): The modem is stateless (one encode/feed call = one operation). The app layer decides repetition.
- **Call mode** (`DT_FASTEST`): Reserved slot with TODO comment, not implemented.
- **UI** (`src/ui/`): No Preact or DOM references.
- **Protocol** (`src/protocol/`): The modem is a thin adapter. Protocol logic lives in the protocol layer.
