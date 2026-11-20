# 06 · System architecture

Stage status: done (Nov 20, 2026)

Wail is client-only and layered. A message goes **down** six layers on the sender, crosses the air as sound, and goes **up** the same six layers on every receiver. Only sound leaves the device.

```
 ┌──────────────── Wail PWA on each device ────────────────┐
 │                                                          │
 │  UI (Preact)  Séance · Compose · Crypt · Altar  ──── Service worker (offline)
 │      ↕                                                   │
 │  Message service  cards, history, send/listen state ──── IndexedDB
 │      ↕                                                   │
 │  Payload pipeline  serialise → compress → lock           │
 │      ↕                                                   │
 │  Packet layer (ours)  manifest + data frames, CRC-32     │
 │      ↕                                                   │
 │  Modem adapter  ggwave WASM: FSK tones, Reed-Solomon     │
 │      ↕                                                   │
 │  Audio I/O  AudioWorklet mic in, buffer playback out     │
 └──────────────────────────┬───────────────────────────────┘
                            │  sound only
                    other devices in earshot
```

## Components

| Component | Folder | Responsibility | Depends on |
| --- | --- | --- | --- |
| UI | `src/ui/` | Screens, theme, spectrogram canvas, calm mode | Message service |
| Message service | `src/app/` | Compose → send, listen → history, state machine | Pipeline, packet, store |
| Payload pipeline | `src/pipeline/` | Card serialise/parse, deflate-raw, lock/unlock | Web Crypto, CompressionStream |
| Packet layer | `src/protocol/` | Frame encode/decode, chunking, reassembly, CRC-32, replay guard | none (pure) |
| Modem adapter | `src/modem/` | Wraps ggwave behind the `Modem` interface | ggwave |
| Audio I/O | `src/audio/` | Mic worklet, playback, analyser | Web Audio API |
| Store | `src/store/` | IndexedDB stores | idb |

The packet layer is pure TypeScript with no browser APIs, so it is fully testable in Node.

## The seam between our code and ggwave

```ts
export interface Modem {
  encode(frame: Uint8Array): Float32Array;        // waveform at the AudioContext sample rate
  feed(samples: Float32Array): Uint8Array | null;  // a frame when one decodes, else null
}
```

Tests use a `PassthroughModem` that returns bytes directly, so protocol tests run in milliseconds.

## Frame format (on the air)

One ggwave transmission carries one frame. ggwave carries at most 140 bytes per transmission and silently truncates anything longer (measured Nov 20, see `docs/field-tests.md`). Wail sets `MAX_FRAME = 128` in `src/protocol/constants.ts` to leave margin, and the packet layer refuses to build a longer frame.

A property test also found that ggwave can return **wrong bytes with no error** for payloads of about 8 bytes or less, even on a clean signal (for example `[0, 80]` decoded as `[0, 0]`). Further tests showed the same with low-entropy patterns: 33 zero bytes at fastest speed decode wrong every time. Because the failure is deterministic, plain repeats would not help. The fix:

1. **Whitening.** Every byte after a 1-byte clear `salt` is XORed with a pseudo-random stream seeded by that salt, so the data never looks like zero runs.
2. **A new salt for every repeat**, so a frame that fails once gets an independent second chance.
3. **CRC-16 per frame**, so a wrong decode is dropped instead of trusted, plus CRC-32 over the whole message.
4. **Minimum frame of 12 bytes.**

Lab result with this design at FAST speed: 4 of 585 pattern frames failed with their first salt, all 4 decoded with another salt, and none failed all three.

| Field | Bytes | Notes |
| --- | --- | --- |
| salt | 1 | Sent in the clear. Seeds the whitening mask for the rest of the frame. A new salt for every repeat |
| magic | 1 | `0x57` ("W"), whitened like everything below |
| version + type | 1 | high nibble version = 1; low nibble type: 0 manifest, 1 data, 2 repair request |
| message_id | 2 | random per message |
| seq | 1 | 0 = manifest, 1..255 = data |
| body | ≤ 120 | zero-padded before whitening so the frame is at least 12 bytes |
| crc16 | 2 | CRC-16/CCITT-FALSE over magic..body; a mismatch drops the frame |

**Manifest body** (inside the whitened part): total_frames (1), kind (1: 0 text, 1 contact, 2 location, 3 notice, 4 file), flags (1: bit0 compressed, bit1 locked, bit2 broadcast), payload_len (2), crc32 (4), then salt (16) and iv (12) only when locked. That is 37 bytes at most.

**Send order:** serialise → compress (only if smaller) → lock (if passphrase) → CRC-32 → split. The receiver reverses it.

## Transfer modes

- **Broadcast carousel (v1 default).** Play the manifest and all data frames, then repeat the cycle 3 times. Receivers collect until every `seq` has arrived. No back channel, unlimited listeners.
- **Duplex repair (stretch).** The receiver plays a repair-request frame listing missing seq numbers; the sender replays only those.

**Air time (lab, Nov 20):** a 100-character text is one manifest frame plus one data frame, about 9 s per cycle at FAST and about 5 s at FASTEST. Broadcast repeats 3 cycles. A 500-character notice is 5 data frames, about 40 s per cycle at FAST, which is why v1 stays short.

## Data design (on the device)

IndexedDB database `wail`, version 1:

| Store | Key | Fields | Notes |
| --- | --- | --- | --- |
| messages | id (UUID) | direction, kind, body (JSON), locked, status, created_at, air_time_ms, frame_count | Index on created_at |
| transfers | message_id | total_frames, received (seq list), frames (seq → bytes), first_seen_at, last_seen_at | Deleted on success or 10 min after the last frame |
| settings | key | value | Volume, speed, calm mode. Never the passphrase |
| diagnostics | auto id | run_at, channel, distance_label, attempts, successes, avg_snr | Field-test log |

Passphrases and keys live in memory only.

## Security

| Threat | Answer |
| --- | --- |
| Eavesdropping | Optional lock: PBKDF2-SHA-256 (310,000 iterations, 16-byte salt per message) → AES-GCM-256 |
| Tampering | AES-GCM tag on locked messages; CRC-32 on all (accidents only), so unlocked messages show "unverified sender" |
| Replay | message_id ignored if completed in the last 10 minutes (R13) |
| Data leaks | No backend, CSP blocks outside calls, no analytics |
| Mic left on | Capture only on the Listen screen, with an indicator |

Limit stated in the README: Wail hides *what* was said when locked, not *that* a transmission happened.

## Testing strategy

**Property-based tests (fast-check), one or more per EARS requirement**

| ID | Property, for any valid input | Req |
| --- | --- | --- |
| P1 | Split 0 to 2,048 random bytes into frames, reassemble: same bytes | R3 |
| P2 | Frames in any order, with duplicates, reassemble to the same bytes | R3, R5 |
| P3 | Any missing frame gives "incomplete", never wrong bytes | R4 |
| P4 | Any single flipped byte after reassembly is rejected by CRC-32 | R4 |
| P5 | Lock then unlock with the same passphrase is identity; any other passphrase fails | R6, R7 |
| P6 | Compress then decompress is identity for any UTF-8 string | R1 |
| P7 | Every card type serialises and parses back to an equal object | R8 |
| P8 | Whitening twice with the same salt returns the original frame | R3 |
| P9 | Any corrupted frame (one or more bytes changed) fails its CRC-16 and is dropped | R4 |
| P10 | No built frame is shorter than 12 or longer than 128 bytes | R1 |

**Noise suite (Node):** ggwave encodes a frame, we add white noise and echo at fixed SNR levels, decode, and record the success rate per level. CI fails if it drops below the baseline.

**End to end (Playwright):** Chromium runs with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`, so the Listen flow is tested with a real recording.

**Field-test matrix (results in `docs/field-tests.md`)**

| Sender | Receiver | Channel | Distances | Tries each |
| --- | --- | --- | --- | --- |
| iQOO Neo 6 (Chrome) | Laptop (Chrome) | Air | 0.5 m, 1 m, 3 m | 20 |
| Laptop | iQOO Neo 6 | Air | 0.5 m, 1 m, 3 m | 20 |
| iQOO Neo 6 | Vivo P27 | Air | 1 m, 3 m | 20 |
| Vivo P27 | Samsung (father's) | Air | 1 m, 3 m | 20 |
| iQOO Neo 6 | Vivo P27 + Samsung + laptop at once | Broadcast via speaker | 3 m, 6 m | 10 |
| iQOO Neo 6 | Laptop | Bluetooth speaker | 3 m, 6 m | 10 |
| iQOO Neo 6 | Vivo P27 | WhatsApp call, normal call | n/a | 10 |

## Deployment

GitHub `main` → Vercel static deploy (HTTPS). Preview deploys for every PR. No environment variables or secrets in the app.
