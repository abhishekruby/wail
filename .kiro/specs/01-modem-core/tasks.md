# Implementation Plan: Modem Core (`src/modem/`)

## Overview

Implements the modem-core layer: a type-safe interface to encode frames as audio and decode samples back to frames. Supports ggwave (production) and a test double (PassthroughModem) for protocol testing. Configuration and validation are pure TypeScript. The layer is thin by design — logic belongs in the protocol and app layers.

## Tasks

- [x] 1. Create `src/modem/modem.ts` and type stubs
  - [x] 1.1 Create `src/modem/modem.ts`
    - Define `EncodeAudioResult` type as `{ ok: true; samples: Float32Array } | { ok: false; error: 'frame-too-large' | 'empty-frame' }`
    - Define the `Modem` interface with two methods:
      - `encode(frame: Uint8Array): EncodeAudioResult` — Takes a frame, returns either a Float32 waveform or an error result
      - `feed(samples: Float32Array): Uint8Array[]` — Takes audio samples, returns a list of decoded frames (zero or more)
    - Add JSDoc comments explaining that `encode` returns amplitude [−1, +1] on success, `feed` accepts any block size, and both are synchronous
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [x] 1.2 Create `src/modem/modem-config.ts`
    - Define `ModemConfig` interface with fields: `speed: 'normal' | 'fast'`, `volume: number`, `sampleRate: number`, `callMode?: 'dt-fastest'`
    - Define `ValidResult` type as `{ ok: true } | { ok: false; error: string }`
    - Implement `validateModemConfig(config: ModemConfig): ValidResult` with validation logic:
      - `speed` not in `{'normal', 'fast'}` → error `'invalid-speed'`
      - `volume` not in [1, 100] or not integer → error `'invalid-volume'`
      - `sampleRate <= 0` or not integer → error `'invalid-sample-rate'`
      - If `callMode` is defined, do NOT validate it (reserved for future); include TODO comment: "Call mode `DT_FASTEST` at volume 50 is reserved for research on narrowband call channels (WhatsApp, Telegram, etc.). Not used for room broadcast (fails at RT60 0.5 s). To implement: add conditional logic in GgwaveModem to set protocolId = GGWAVE_PROTOCOL_DT_FASTEST and enforce volume = 50."
      - Return `{ ok: true }` if all checks pass
    - Export `DEFAULT_MODEM_CONFIG: Readonly<ModemConfig>` = `{ speed: 'fast', volume: 10, sampleRate: 48000 }`
    - Never throw on invalid input
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 2. Implement PassthroughModem test double
  - [x] 2.1 Create `src/modem/passthrough-modem.ts`
    - Define `PassthroughModem` class implementing `Modem`
    - Constructor: accept and ignore all configuration
    - `encode(frame: Uint8Array): EncodeAudioResult`:
      - If `frame.length < 1`, return `{ ok: false; error: 'empty-frame' }`
      - If `frame.length > MAX_FRAME`, return `{ ok: false; error: 'frame-too-large' }`
      - Otherwise, convert frame bytes to Float32 samples: `sample[i] = frame[i] / 255` and return `{ ok: true; samples }`
    - `feed(samples: Float32Array): Uint8Array[]`:
      - Convert Float32 view to Int8: `const int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)`
      - Import `decodeFrame` from `src/protocol/frame-decoder.js`
      - Call `const frame = decodeFrame(int8View)`
      - If frame is not null, return `[frame]`
      - Otherwise return `[]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 1.1_

  - [x] 2.2 Write unit test `tests/modem/modem.test.ts` (PassthroughModem portion)
    - Test: PassthroughModem.encode with valid frame returns `{ ok: true; samples: Float32Array }`
    - Test: PassthroughModem.encode with empty frame returns `{ ok: false; error: 'empty-frame' }`
    - Test: PassthroughModem.encode with oversized frame returns `{ ok: false; error: 'frame-too-large' }`
    - Test: PassthroughModem.feed with valid frame bytes returns that frame
    - Test: PassthroughModem.feed with invalid frame bytes returns empty list
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 3. Implement GgwaveModem
  - [x] 3.1 Create `src/modem/ggwave-modem.ts`
    - Define `GgwaveModemConfig` interface with fields: `sampleRate: number`, `speed: 'normal' | 'fast'`, `volume: number`
    - Define `GgwaveModem` class implementing `Modem`
    - Static factory `static async create(config: GgwaveModemConfig): Promise<GgwaveModem>`:
      - Validate `config.sampleRate > 0` (throw or return early)
      - Validate `config.speed` is `'normal'` or `'fast'` (throw or return early)
      - Validate `config.volume` is in [1, 100] (throw or return early)
      - Import ggwave WASM: `import factory from 'ggwave'` (default export)
      - Await factory: `const gg = await factory()`
      - Call `gg.disableLog()` to suppress debug output
      - Call `const p = gg.getDefaultParameters()` to get the default parameters object
      - Set sample rate: `p.sampleRateInp = config.sampleRate; p.sampleRateOut = config.sampleRate`
      - Map speed to protocol ID:
        - `'normal'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL`
        - `'fast'` → `gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST`
      - Create instance: `const inst = gg.init(p)`
      - Return `new GgwaveModem(gg, inst, config, protocolId)` (via private constructor)
      - _Requirements: 2.1, 4.1, 4.2_

    - Private constructor: Store `gg`, `inst`, `config`, `protocolId` for use in encode/feed

    - `encode(frame: Uint8Array): EncodeAudioResult`:
      - If `frame.length < 1`, return `{ ok: false; error: 'empty-frame' }`
      - If `frame.length > MAX_FRAME` (128), return `{ ok: false; error: 'frame-too-large' }`
      - Call ggwave: `const result = gg.encode(inst, frame, this.protocolId, this.config.volume)`
      - **Copy out of WASM memory immediately**: `const copy = new Int8Array(result)`
      - Create Float32Array from copied bytes (bit-reinterpretation): `const float32 = new Float32Array(copy.buffer)`
      - Add inline comment: "WASM memory discipline: copy the result immediately before the next ggwave call"
      - Return `{ ok: true; samples: float32 }`
      - _Requirements: 2.2, 2.4, 2.5, 2.6, 5.1, 5.2, 6.1, 7.1_

    - `feed(samples: Float32Array): Uint8Array[]`:
      - Build byte view handling sub-array views: `const int8View = new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength)`
      - Add inline comment: "Bit-reinterpretation, not numeric conversion: the bytes of the Float32 representation are read as Int8"
      - Initialize empty frames list: `const frames: Uint8Array[] = []`
      - Split `int8View` into chunks of at most 4096 bytes
      - For each chunk:
        - Call ggwave: `const result = gg.decode(inst, chunk)`
        - If result is empty/null, continue to next chunk
        - **Copy out of WASM memory immediately**: `const decoded = new Uint8Array(result)`
        - Add to frames: `frames.push(decoded)`
      - After all chunks, loop back to check if another frame is ready (ggwave buffers state internally)
      - Add inline comment about WASM memory discipline
      - Return the frames list (possibly empty)
      - _Requirements: 2.3, 2.6, 6.1, 7.2_

  - [x] 3.2 Write property test `tests/modem/R2.ggwave-round-trip.prop.test.ts`
    - **Property 2: GgwaveModem encode-feed round-trip** — for random frames of 12..128 bytes, `encode` then `feed(encodedWaveform)` returns exactly the same bytes, at both 'normal' and 'fast' speeds
    - Create a GgwaveModem instance per speed using `await GgwaveModem.create(config)`
    - Arbitraries: `fc.uint8Array({ minLength: 12, maxLength: 128 })` for frames; `fc.constantFrom('normal', 'fast')` for speed
    - For each frame and speed:
      - Call `result = modem.encode(frame)`
      - Verify `result.ok === true`
      - Call `decoded = modem.feed(result.samples)`
      - Verify `decoded.length === 1` and `decoded[0]` equals `frame` (byte-for-byte)
    - `numRuns: 30`; set test timeout to 60,000 ms
    - **Validates: Requirements 2.2, 2.3, 2.5, 6.1, 7.1, 7.2**

  - [x] 3.3 Write property test `tests/modem/R2.multi-block-feed.prop.test.ts`
    - **Property: Multi-block feed assembly** — splitting an encoded frame into random chunks (64..4096 bytes) and feeding them one by one still decodes the frame
    - Create a modem instance
    - Generate a random frame and encode it: `result = modem.encode(frame)`
    - Verify `result.ok === true`
    - Split `result.samples` into random-sized chunks (64..4096 bytes)
    - Feed chunks one by one, collecting all decoded frames
    - Verify exactly one frame was decoded and it matches the original
    - `numRuns: 10`; set test timeout to 60,000 ms
    - **Validates: Requirements 1.4, 2.3, 6.1**

  - [x] 3.4 Write example-based noise test `tests/modem/R2.noise-resilience.test.ts`
    - **Property: Noise resilience** — white noise at +10 dB and 0 dB SNR decodes 10/10 times at FAST speed
    - Create a modem instance with speed='fast'
    - Seeded PRNG (Box-Muller): generate Gaussian noise deterministically with fixed seed
    - Test at +10 dB SNR and 0 dB SNR (two test sets):
      - For +10 dB: noiseRms = signalRms / 10^(10 / 20) ≈ 0.316 × signalRms
      - For 0 dB: noiseRms = signalRms / 10^(0 / 20) = signalRms
      - Measure signalRms over the non-silent encoded waveform
      - For each of 10 iterations at each SNR:
        - Generate a random frame (12..128 bytes)
        - Encode it
        - Add Gaussian noise with the computed amplitude
        - Call `decoded = modem.feed(noisySignal)`
        - Verify exactly one frame was decoded and matches the original
    - Expect 10/10 decoded at both SNRs (lab baseline)
    - Set test timeout to 60,000 ms
    - _Validates: Requirements 2.5, 5.1, 5.2_

  - [x] 3.5 Write unit test `tests/modem/modem.test.ts` (GgwaveModem portion)
    - Test: `GgwaveModem.create` with invalid config throws or returns error
    - Test: `encode` with valid frame returns `{ ok: true; samples: Float32Array }` with amplitude in [−1, +1]
    - Test: `encode` with empty frame returns `{ ok: false; error: 'empty-frame' }`
    - Test: `encode` with oversized frame returns `{ ok: false; error: 'frame-too-large' }`
    - _Requirements: 2.1, 2.2, 2.4, 5.1, 5.2_

- [x] 4. Create barrel and validate
  - [x] 4.1 Create `src/modem/index.ts`
    - Re-export all public types and functions:
      - `export { Modem, EncodeAudioResult } from './modem.js'`
      - `export { GgwaveModem } from './ggwave-modem.js'`
      - `export { PassthroughModem } from './passthrough-modem.js'`
      - `export { validateModemConfig, DEFAULT_MODEM_CONFIG } from './modem-config.js'`
      - `export type { ModemConfig, ValidResult } from './modem-config.js'`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2_

  - [x] 4.2 Write unit test `tests/modem/modem.test.ts` (configuration portion)
    - Test: `validateModemConfig` with valid config returns `{ ok: true }`
    - Test: invalid speed returns `{ ok: false, error: 'invalid-speed' }`
    - Test: invalid volume (0, 101, non-integer) returns `{ ok: false, error: 'invalid-volume' }`
    - Test: invalid sample rate (0, −1, non-integer) returns `{ ok: false, error: 'invalid-sample-rate' }`
    - Test: `DEFAULT_MODEM_CONFIG` passes validation
    - Test: `DEFAULT_MODEM_CONFIG.speed` is `'fast'`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Final checkpoint — Ensure all tests pass
  - Run `npx vitest run tests/modem/` with 60s timeout and confirm no failures. All tests (unit + property) should pass before marking this spec complete.

- [x] 6. Implement Audio I/O (`src/audio/`)
  - [x] 6.1 Create `src/audio/audio-context.ts`
    - Export `getAudioContext(): AudioContext` that returns a singleton AudioContext, requesting `{ sampleRate: 48000 }`
    - Export `resumeAudio(): Promise<void>` that calls `ctx.resume()` (must be called from a user tap to comply with autoplay rules)
    - Callers must read `ctx.sampleRate` after resuming (iOS may give 44,100) and pass it to `GgwaveModem.create()`
    - _Requirements: 10.1_

  - [x] 6.2 Create `src/audio/mic-worklet.ts`
    - Define an AudioWorkletProcessor named 'wail-mic' (register with `registerProcessor('wail-mic', WailMicProcessor)`)
    - TypeScript DOM lib lacks worklet globals; declare at the top:
      - `declare abstract class AudioWorkletProcessor { readonly port: MessagePort; abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean; }`
      - `declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;`
      - `export {};` (makes this a module)
    - In `process(inputs, outputs, parameters)`:
      - Copy `inputs[0]![0]` (128 Float32 samples; the browser reuses the buffer) with `new Float32Array(...)`
      - Post with `this.port.postMessage(copy, [copy.buffer]); return true;`
    - _Requirements: 10.1, 10.2_

  - [x] 6.3 Create `src/audio/mic-capture.ts`
    - Define `MicError` with code property: `code: 'denied' | 'no-mic' | 'busy' | 'unknown'`
    - Define `MicCapture` type as `{ stop(): void }`
    - Export `startMic(ctx: AudioContext, onBlock: (samples: Float32Array) => void): Promise<MicCapture>`
    - Load worklet: `import workletUrl from './mic-worklet.ts?worker&url';` then `ctx.audioWorklet.addModule(workletUrl);`
    - Call `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })`
    - Create `MediaStreamAudioSourceNode` and `AudioWorkletNode('wail-mic')`
    - Connect: `source → workletNode` (do NOT connect workletNode to ctx.destination to avoid echoing the mic)
    - Set `port.onmessage = (event) => onBlock(event.data as Float32Array)`
    - Return `{ stop() { workletNode.disconnect(); sourceNode.disconnect(); port.onmessage = null; for (const track of stream.getAudioTracks()) track.stop(); } }`
    - Catch getUserMedia errors and rethrow as MicError:
      - `NotAllowedError` → `code: 'denied'`
      - `NotFoundError` → `code: 'no-mic'`
      - `NotReadableError` → `code: 'busy'`
      - Other → `code: 'unknown'`
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.4 Create `src/audio/playback.ts`
    - Export `playSamples(ctx: AudioContext, samples: Float32Array): Promise<void>`
    - Create `AudioBuffer` of 1 channel at `ctx.sampleRate` with `samples.length` frames
    - Copy samples into buffer: `buffer.getChannelData(0).set(samples)`
    - Create `AudioBufferSourceNode` and connect to `ctx.destination`
    - Resolve promise on `'ended'` event
    - _Requirements: 10.1_

  - [x] 6.5 Create `src/audio/analyser.ts`
    - Export `createAnalyser(ctx: AudioContext, source: AudioNode): { node: AnalyserNode; read(into: Uint8Array): void }`
    - Create AnalyserNode with `fftSize: 2048, smoothingTimeConstant: 0`
    - Connect source → analyser → ctx.destination
    - Return object with `node` and `read(into)` function that calls `analyser.getByteFrequencyData(into)`
    - _Requirements: 10.1_

  - [x] 6.6 Create `src/audio/index.ts`
    - Barrel re-export (use `export type` for types):
      - `export { getAudioContext, resumeAudio } from './audio-context.js'`
      - `export { startMic } from './mic-capture.js'`
      - `export type { MicError, MicCapture } from './mic-capture.js'`
      - `export { playSamples } from './playback.js'`
      - `export { createAnalyser } from './analyser.js'`
    - _Requirements: 10.1_

## Notes

- Tasks are **required** for the spec to be complete (no '*' optional markers)
- Each task references specific requirements for traceability; `Rn.m` refers to Requirement n, criterion m in `requirements.md`
- Property tests use 30 runs for round-trip (default ggwave), 10 runs for multi-block feed, 60,000 ms timeout
- Noise test is example-based: 10 iterations at +10 dB and 10 at 0 dB with seeded PRNG (Box-Muller), expect 10/10 at FAST
- GgwaveModem is created once per session at app startup via `await GgwaveModem.create(config)` and reused for the entire send/receive cycle
- WASM memory discipline: every ggwave output must be copied before the next ggwave call
- PassthroughModem uses byte-to-sample conversion (sample i = byte i / 255) for simple round-trip; `feed` decodes using `decodeFrame` from `src/protocol/`
- Float32 ↔ Int8 conversion is bit-reinterpretation (IEEE 754 byte representation), not numeric division
- Default config speed is 'fast' (steering protocol.md requirement)
- Audio I/O layer must NOT be tested in Node; these are thin browser-only files
- Microphone capture runs in an AudioWorklet to keep processing off the main render thread
- Volume for playback comes from modem config (1–100), passed to ggwave.encode()

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2"] },
    { "id": 8, "tasks": ["5"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 11, "tasks": ["6.6"] }
  ]
}
```
