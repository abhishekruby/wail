# Design Document — Modem Core (`src/modem/`)

## Overview

The modem-core layer connects Wail's protocol layer to physical audio hardware via ggwave. It is split into four modules:

1. **modem.ts**: The `Modem` interface (abstract contract).
2. **ggwave-modem.ts**: The concrete `GgwaveModem` class using the ggwave WASM library.
3. **passthrough-modem.ts**: The test double `PassthroughModem` for protocol testing.
4. **modem-config.ts**: Type-safe configuration and validation.

The layer is intentionally thin — it encodes/decodes, copies WASM memory, and delegates all other logic to the app and protocol layers.

---

## Architecture

```
┌────────────────────────────────────────────┐
│          src/modem/                        │
│                                            │
│  modem.ts        interface Modem           │
│                  - encode(frame): Float32  │
│                  - feed(samples): Uint8[]  │
│                                            │
│  ggwave-modem.ts  class GgwaveModem        │
│  │  ├─ ggwave WASM instance                │
│  │  ├─ encode: frame → Int8 from WASM      │
│  │  └─ feed: Int8View → Uint8Array[]       │
│  │     (loop until decode returns null)    │
│  │                                         │
│  passthrough-modem.ts class PassthroughModem
│  │  ├─ no ggwave                           │
│  │  ├─ encode: return Float32.from([])     │
│  │  └─ feed: frame bytes → decode direct   │
│  │                                         │
│  modem-config.ts TypeScript types          │
│                 & validation functions     │
│                                            │
│  index.ts        public API barrel         │
└────────────────────────────────────────────┘
         ↓ used by
  src/app/        (message service)
  tests/modem/    (Node-only unit tests)
         ↓ uses
  src/protocol/   (decodeFrame for PassthroughModem)
  ggwave WASM     (GgwaveModem only)
```

**Dependency rule**: `src/modem/` imports from `src/protocol/` (read-only, for `decodeFrame` in PassthroughModem) and ggwave (WASM, for GgwaveModem). It does not import from `src/app/`, `src/ui/`, `src/audio/`, or `src/store/`.

---

## Components and Interfaces

### `src/modem/modem.ts`

#### Types

```ts
export type EncodeAudioResult =
  | { ok: true; samples: Float32Array }
  | { ok: false; error: 'frame-too-large' | 'empty-frame' };

export interface Modem {
  /**
   * Encode a frame into a playable audio waveform.
   * Returns { ok: true; samples: Float32Array } with amplitude in [-1, +1] ready for playback.
   * Returns { ok: false; error: ... } if frame is out of range (>MAX_FRAME or <1 byte).
   */
  encode(frame: Uint8Array): EncodeAudioResult;

  /**
   * Decode received audio samples back into frames.
   * Accepts any block size (64..4096 or more samples).
   * Buffers internally and returns a list of decoded frames as they complete.
   * Returns an empty list if no frame is complete yet.
   */
  feed(samples: Float32Array): Uint8Array[];
}
```

### Type

```ts
export interface Modem {
  /**
   * Encode a frame into a playable audio waveform.
   * Returns { ok: true; samples: Float32Array } with amplitude in [-1, +1] ready for playback.
   * Returns { ok: false; error: ... } if frame is out of range (>MAX_FRAME or <1 byte).
   */
  encode(frame: Uint8Array): EncodeAudioResult;

  /**
   * Decode received audio samples back into frames.
   * Accepts any block size (64..4096 or more samples).
   * Buffers internally and returns a list of decoded frames as they complete.
   * Returns an empty list if no frame is complete yet.
   */
  feed(samples: Float32Array): Uint8Array[];
}
```

---

### `src/modem/ggwave-modem.ts`

#### Type

```ts
export interface GgwaveModemConfig {
  sampleRate: number;      // e.g., 48000 or 44100
  speed: 'normal' | 'fast';
  volume: number;          // 1–100, typically 10
}

export class GgwaveModem implements Modem {
  static async create(config: GgwaveModemConfig): Promise<GgwaveModem>;
  private constructor();
  encode(frame: Uint8Array): EncodeAudioResult;
  feed(samples: Float32Array): Uint8Array[];
  reset(): void;
}
```

#### Implementation details

**Static factory `static async create(config: GgwaveModemConfig): Promise<GgwaveModem>`**:
1. Validate `config.sampleRate > 0`.
2. Validate `config.speed` is `'normal'` or `'fast'`.
3. Validate `config.volume` is in [1, 100].
4. Await the ggwave factory: `const gg = await factory()` (default import from 'ggwave').
5. Call `gg.disableLog()` to suppress debug output.
6. Call `const p = gg.getDefaultParameters()` to get the parameters object.
7. Set sample rates: `p.sampleRateInp = config.sampleRate; p.sampleRateOut = config.sampleRate`.
8. Map speed to protocol ID:
   - `'normal'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL`
   - `'fast'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST`
9. Create instance: `const inst = gg.init(p)`.
10. Calculate chunk size: `const chunkBytes = p.samplesPerFrame * 4` (1024 samples × 4 bytes per Float32 = 4096 bytes at 48 kHz).
11. Store `chunkBytes` as a private field for use in `feed()`.
12. Initialize pending buffer: `pending = new Int8Array(0)`.
13. Return `new GgwaveModem(gg, inst, config, protocolId, chunkBytes)` (private constructor with stored fields).

**Private constructor**: Store `gg`, `inst`, `config`, `protocolId`, and `chunkBytes` for use in encode/feed. Initialize `pending` to an empty Int8Array.

**encode(frame: Uint8Array): EncodeAudioResult**:
```
if frame.length < 1:
  return { ok: false; error: 'empty-frame' }

if frame.length > MAX_FRAME:
  return { ok: false; error: 'frame-too-large' }

result = gg.encode(inst, frame, this.protocolId, this.config.volume)
// result is an Int8Array view into WASM memory, containing 32-bit float samples as bytes

// WASM memory discipline: copy the result immediately before the next ggwave call
copy = new Int8Array(result)

// Reinterpret the Int8 bytes as Float32 (bit-reinterpretation, not numeric conversion)
float32 = new Float32Array(copy.buffer)

return { ok: true; samples: float32 }
```

**feed(samples: Float32Array): Uint8Array[]**:
```
// Reinterpret Float32 samples as Int8 byte view
// This is a bit-reinterpretation, not a numeric conversion.
int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)

// Append new samples to pending buffer
if int8View.length > 0:
  combined = new Int8Array(pending.length + int8View.length)
  combined.set(pending, 0)
  combined.set(int8View, pending.length)
  pending = combined

frames = []

// Feed complete chunks to ggwave (each chunk is exactly samplesPerFrame samples = 4096 bytes)
while pending.length >= chunkBytes:
  chunk = pending.subarray(0, chunkBytes)
  
  // ggwave's decode() ONLY works when fed exactly samplesPerFrame samples.
  // Feeding fewer or more bytes decodes nothing.
  result = gg.decode(inst, chunk)
  
  loop:
    if result is empty or null:
      break loop
    
    // WASM memory discipline: copy immediately before the next ggwave call
    frame = new Uint8Array(result)
    frames.push(frame)
    
    // Check if another frame is ready
    result = gg.decode(inst, new Int8Array(0))
  
  // Remove processed chunk from pending
  pending = pending.slice(chunkBytes)

return frames
```

**reset(): void**:
```
// Clear any partially-buffered samples
pending = new Int8Array(0)
```

**WASM memory discipline**: Document in comments that every ggwave output must be copied before the next ggwave call. The WASM linear memory is reused for each operation.

---

### `src/modem/passthrough-modem.ts`

#### Type

```ts
export class PassthroughModem implements Modem {
  constructor();
  encode(frame: Uint8Array): EncodeAudioResult;
  feed(samples: Float32Array): Uint8Array[];
}
```

#### Implementation details

**Constructor**: Accept (and ignore) all configuration. Store nothing.

**encode(frame: Uint8Array): EncodeAudioResult**:
```
if frame.length < 1:
  return { ok: false; error: 'empty-frame' }

if frame.length > MAX_FRAME:
  return { ok: false; error: 'frame-too-large' }

// Convert frame bytes to Float32 samples: sample i = byte i / 255
samples = new Float32Array(frame.length)
for i in 0..frame.length-1:
  samples[i] = frame[i] / 255

return { ok: true; samples: samples }
```

**feed(samples: Float32Array): Uint8Array[]**:
```
// Convert Float32 samples back to bytes: byte i = Math.round(sample i * 255)
int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)

// Try to decode as a frame
frame = decodeFrame(int8View)  // from src/protocol/

if frame is not null:
  return [frame]
else:
  return []
```

**Note**: PassthroughModem is for app-layer tests only, where `feed` receives exactly one encoded frame. It does not buffer across calls or handle multi-frame streams. The encode method converts frame bytes directly to Float32 samples without calling ggwave, allowing tests to bypass the WASM module entirely.

---

### `src/modem/modem-config.ts`

#### Types

```ts
export interface ModemConfig {
  speed: 'normal' | 'fast';
  volume: number;              // 1–100
  sampleRate: number;          // positive integer
  callMode?: 'dt-fastest';     // reserved, not implemented
}

export type ValidResult =
  | { ok: true }
  | { ok: false; error: string };
```

#### API

```ts
/**
 * Validate modem configuration.
 * Returns { ok: true } if all fields are valid.
 * Returns { ok: false, error: ... } on the first validation failure.
 * Never throws.
 */
export function validateModemConfig(config: ModemConfig): ValidResult;

/**
 * Default modem configuration.
 */
export const DEFAULT_MODEM_CONFIG: Readonly<ModemConfig> = {
  speed: 'fast',
  volume: 10,
  sampleRate: 48000,
};
```

#### Validation logic

```
if config.speed not in {'normal', 'fast'}:
  return { ok: false, error: 'invalid-speed' }

if config.volume not in [1, 100] or not an integer:
  return { ok: false, error: 'invalid-volume' }

if config.sampleRate <= 0 or not an integer:
  return { ok: false, error: 'invalid-sample-rate' }

if config.callMode is defined:
  // For now, only document as reserved. Do not validate it.
  // TODO: Call mode `DT_FASTEST` at volume 50 is reserved for research
  // on narrowband call channels (WhatsApp, Telegram, etc.).
  // Not used for room broadcast (fails at RT60 0.5 s).
  // To implement: add conditional logic in GgwaveModem to set
  // protocolId = GGWAVE_PROTOCOL_DT_FASTEST and enforce volume = 50.

return { ok: true }
```

---

### `src/modem/index.ts`

Barrel re-exporting the public surface:

```ts
export { Modem } from './modem.js';
export { GgwaveModem } from './ggwave-modem.js';
export { PassthroughModem } from './passthrough-modem.js';
export { validateModemConfig, DEFAULT_MODEM_CONFIG } from './modem-config.js';
export type { ModemConfig, ValidResult } from './modem-config.js';
```

---

## Data Models

### Sample rate

The AudioContext's sample rate (typically 48,000 or 44,100 Hz on Android Chrome) is passed once at modem creation and never changes. If the sample rate changes (e.g., the user switches audio devices), a new modem instance must be created.

### Volume scaling

ggwave expects volume as an integer in [1, 100]. The modem layer stores this configuration and passes it to `ggwave.encode()` on every encode call. Volume does NOT change per-frame; it is a global setting.

### Protocol selection

ggwave's protocol ID (e.g., `GGWAVE_PROTOCOL_AUDIBLE_NORMAL` vs. `GGWAVE_PROTOCOL_AUDIBLE_FAST`) is determined at ggwave instantiation based on the `speed` setting and cannot be changed without creating a new modem instance.

---

## Audio I/O (`src/audio/`)

The audio layer manages browser Web Audio APIs for microphone capture and speaker playback. It is split into six thin modules:

1. **audio-context.ts**: Shared `AudioContext` singleton, requested at 48 kHz.
2. **mic-worklet.ts**: AudioWorkletProcessor that posts microphone samples to the main thread.
3. **mic-capture.ts**: Starts the mic capture chain (getUserMedia → AudioWorkletNode → onmessage).
4. **playback.ts**: Plays a Float32Array via AudioBufferSourceNode with per-frame timing.
5. **analyser.ts**: Creates an AnalyserNode for spectrum display (not used by the modem).
6. **index.ts**: Barrel re-exporting the public API.

The layer is intentionally thin — it bridges browser APIs and delegates all audio processing logic to the protocol and modem layers. No audio processing happens on the main thread.

### Architecture

```
┌────────────────────────────────────────────┐
│          src/audio/                        │
│                                            │
│  audio-context.ts   getAudioContext()      │
│                     resumeAudio()          │
│                                            │
│  mic-worklet.ts     AudioWorkletProcessor  │
│                     (register 'wail-mic')  │
│                                            │
│  mic-capture.ts     startMic(ctx, onBlock) │
│                     → { stop() }           │
│                                            │
│  playback.ts        playSamples(ctx, samples)
│                     → Promise<void>        │
│                                            │
│  analyser.ts        createAnalyser(ctx, source)
│                     → { node, read }       │
│                                            │
│  index.ts           public API barrel      │
└────────────────────────────────────────────┘
         ↓ used by
  src/app/           (send/listen state machine)
  src/ui/            (Séance, Compose, Crypt screens)
         ↓ uses
  src/modem/         (GgwaveModem.create)
  Web Audio API      (AudioContext, getUserMedia, AudioWorklet)
```

**Dependency rule**: `src/audio/` imports from `src/modem/` and uses native Web Audio APIs only. It does not import from `src/protocol/`, `src/app/`, `src/ui/`, or `src/store/`.

### Key design decisions

**Single AudioContext per page**: One `AudioContext` is created on first call to `getAudioContext()` and cached. The app layer reads `ctx.sampleRate` after resuming audio (a user tap) and passes it to `GgwaveModem.create()`.

**Mic runs in AudioWorklet**: The microphone callback (getUserMedia MediaStreamSource) is connected to an AudioWorkletNode named 'wail-mic'. The worklet copies each 128-sample block to the main thread via `postMessage`. This keeps audio processing off the render thread and allows the app layer to decode frames asynchronously.

**Errors are semantic**: `getUserMedia` errors (NotAllowedError, NotFoundError, NotReadableError) are caught and rethrown as `MicError` with a code ('denied', 'no-mic', 'busy', 'unknown') so the UI can show human-readable messages.

**Playback timing**: Each encoded frame is played as a separate AudioBufferSourceNode connected to ctx.destination. The app layer waits for `onended` before playing the next frame, allowing a 300 ms gap between frames without blocking.

**Mic stop is explicit**: When leaving the Listen screen, the app layer calls `micCapture.stop()`, which disconnects both the MediaStreamSource and AudioWorkletNode, clears the message listener, and stops every track (R10).

**Volume is not audio-layer concern**: Volume for playback is set via modem config (1–100 scale passed to ggwave). The audio layer just plays whatever Float32Array it receives.

### Microphone constraints

```ts
{
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  }
}
```

Voice processing (echo cancellation, noise suppression, AGC) destroys the acoustic modem tones. These constraints must be explicit (not omitted), so the browser does not apply voice processing by default on some platforms.

### Sample rate handling

iOS may return 44,100 Hz instead of 48,000 Hz, even after requesting 48,000. The app layer must always read `ctx.sampleRate` after resuming audio and pass it to `GgwaveModem.create()`. The modem layer will handle the actual sample rate correctly.

---

## Testing Strategy

### No browser tests

The modem layer touches Web Audio and ggwave WASM. These are **not tested in Node**. Unit tests for the modem layer are thin, example-based, and focus on the TypeScript types and synchronous validation.

### Validation tests

```
tests/modem/modem.test.ts (example-based)
├─ PassthroughModem frame preservation
│   └─ encode(frame) + feed(bytes) → same frame
├─ Configuration validation
│   ├─ valid config returns ok: true
│   ├─ invalid speed / volume / sample-rate returns error
│   └─ DEFAULT_MODEM_CONFIG passes validation
└─ Error handling
    └─ oversized frame + encode returns silent
```

### Integration tests

Property tests for ggwave round-trip are run from `tests/modem/R2.ggwave-round-trip.prop.test.ts` using ggwave in Node (via `tests/ggwave-baseline.test.ts`), which is **allowed** because ggwave's JavaScript API works in Node. However, Web Audio integration (mic capture, playback) is NOT tested here.

---

## Error Handling

| Condition | Where caught | Caller receives |
|---|---|---|
| Frame > MAX_FRAME | `GgwaveModem.encode` | Silent `Float32Array.from([])` (to be replaced with error result in a future task) |
| Invalid config | `validateModemConfig` | `{ ok: false, error: ... }` |
| ggwave WASM error | `GgwaveModem` constructor or encode/feed | Exception bubbles (caller's responsibility) |
| Malformed samples | `PassthroughModem.feed` or `GgwaveModem.feed` | Empty decode list `[]` |

---

## Non-Goals

- **Async operations**: Encoding and decoding are synchronous. No promises, no worker threads.
- **Audio buffering**: The modem does not buffer encoded waveforms; it returns raw `Float32Array` to the caller, who passes it to `src/audio/playback.ts`.
- **Mic buffering**: The modem does not read from the mic; that is `src/audio/mic-capture.ts`.
- **UI feedback**: No DOM or Preact. Status messages are the app layer's responsibility.
- **Call mode**: Reserved for future research. Not implemented.

---

## Correctness Properties (Design)

### Property 1: Configuration round-trip

A configuration that passes `validateModemConfig` can be used to construct a `GgwaveModem` without throwing.

**Validates: Requirements 4.1, 4.2**

---

### Property 2: Encode/feed idempotence

Calling `feed(encode(frame))` multiple times with the same frame returns the same list of frames each time (the internal WASM state is deterministic given the same input).

**Validates: Requirements 2.2, 2.3, 6.1**

---

### Property 3: PassthroughModem is a valid Modem

`PassthroughModem` implements the `Modem` interface and can be substituted for `GgwaveModem` in tests without type errors.

**Validates: Requirements 3.1, 1.1**

---

## Implementation Notes

### Why reinterpret Float32 as Int8?

When ggwave's `encode()` returns samples, they are encoded as 32-bit float values stored as bytes (the IEEE 754 bit representation). When we call `decode()`, it expects the same byte representation. By reinterpreting `Float32Array.buffer` as an `Int8Array`, we read the byte data directly (not a numeric conversion). This is the same path used by `tests/ggwave-baseline.test.ts` and is verified to work correctly.

### Why copy from WASM memory?

ggwave allocates encode/decode buffers in WASM linear memory and reuses them on the next call. If you hold a reference to the view after the next call, it may contain stale or corrupted data. By copying immediately, we escape WASM memory and guarantee the bytes are stable.

### Why async factory for GgwaveModem?

The ggwave module is loaded via `const gg = await factory()`, which is async. To create a GgwaveModem instance, we must await this factory. Using a static `async create()` factory method is the idiomatic TypeScript pattern for async construction. The private constructor receives the already-loaded ggwave module.
