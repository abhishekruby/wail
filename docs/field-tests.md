# Field and lab test log

Every reliability claim in the README, Devpost text and video must point to a row here.

## Lab baseline (Nov 20, 2026, ggwave 0.4.0 in Node, 48 kHz, volume 10)

Synthetic tests with no speaker or microphone, run before development started.

**Payload limit and air time per transmission**

| Payload | NORMAL | FAST | FASTEST |
| --- | --- | --- | --- |
| 16 B | 2.41 s | 1.83 s | 1.26 s |
| 64 B | 6.63 s | 4.65 s | 2.67 s |
| 100 B | 9.90 s | 6.83 s | 3.75 s |
| 140 B | 13.55 s | 9.26 s | 4.97 s |
| 141 B or more | silently cut to 140 B | same | same |

Findings:
- **Max payload is 140 bytes per transmission.** Longer input is truncated without an error, so the packet layer must enforce the limit itself.
- **Binary-safe:** byte values 0 to 255 passed in a `Uint8Array` round-trip exactly.
- Effective speed at 140 B: about 10 B/s (NORMAL), 15 B/s (FAST), 28 B/s (FASTEST).
- **Silent corruption on short payloads.** On a clean signal, wrong bytes came back with no error for: 3 B at FAST (3 of 30), 6 B at FAST (1 of 30), 2 B at FASTEST (5 of 30), 3 B at FASTEST (10 of 30) and 8 B at FASTEST (1 of 30). NORMAL had no errors. At 12, 24, 64 and 128 B, all 720 runs across the three speeds were exact. Found by a fast-check property test.
- **Silent corruption on low-entropy patterns.** At FASTEST, an all-zero payload decoded wrong at 33, 35, 37, 39, 65, 67, 71, 99 and 103 bytes; one-byte-set patterns failed at 17, 19, 20, 22 and 39 bytes. Same input, same failure every time.
- **Fix tested:** whitening with a per-repeat salt. FASTEST: all patterns exact from 12 to 128 B. FAST: 4 of 585 frames failed on the first salt, all 4 decoded with another salt, 0 failed all three. NORMAL without whitening: 0 of 195 wrong.
- Design consequence: salt + whitening + CRC-16 per frame + CRC-32 per message (see `.kiro/steering/protocol.md`).

**White-noise tolerance, 64-byte frames, 10 tries per cell**

| SNR | NORMAL | FAST | FASTEST |
| --- | --- | --- | --- |
| +20 to −5 dB | 10/10 at every level tested (20, 10, 5, 0, −5) | 10/10 | 10/10 |
| −10 dB | 0/10 | 0/10 | 0/10 |
| −15, −20 dB | 0/10 | 0/10 | 0/10 |

The cliff sits between −5 and −10 dB. Real rooms add echo, speaker distortion and mic processing, so field results will be worse than this. That is what the field tests below measure.

## Codec simulation (Nov 20, 2026, offline, no speaker or microphone)

100-byte payloads, 10 per cell, ggwave volume 10, through ffmpeg 6.1.1 codecs. Written by Antigravity (`spikes/codec-sim/run.ts`), re-run independently by Claude Code with identical results in all 42 cells. Full report: `docs/research/codec-sim.md`.

| Protocol | Air time | AMR-NB 12.2k / 4.75k (2G/3G call) | AMR-WB 23.85k / 12.65k (VoLTE) | Opus 16k / 32k (WhatsApp-like) |
| --- | --- | --- | --- | --- |
| AUDIBLE_FAST | 6.83 s | 0/10 · 0/10 | 10/10 · 10/10 | 10/10 · 10/10 |
| AUDIBLE_FASTEST | 3.75 s | 0/10 · 0/10 | 10/10 · 10/10 | 10/10 · 10/10 |
| DT_FASTEST | 9.83 s | 10/10 · 10/10 | 10/10 · 0/10 | 10/10 · 10/10 |
| DT_FASTEST, volume 50 | 9.83 s | 10/10 · 10/10 | 10/10 · 10/10 | 10/10 · 10/10 |

The volume-50 row was also re-run by Claude Code (`node --experimental-strip-types spikes/codec-sim/run.ts 50`) with the same result. Real calls add noise suppression, voice detection and gain control, which this does not model.

## Decoder block size (Nov 25, 2026, Node, ggwave 0.4.0, FAST, 48 kHz)

ggwave decodes only when `decode` receives exactly `samplesPerFrame` samples (1,024 at 48 kHz) per call. Found while reviewing spec 01 (modem core).

| Block size fed to decode | Frames decoded (1 frame, fresh decoder) |
| --- | --- |
| 64, 128, 256, 512 samples | 0 |
| 1,024 or 4,096 samples | 1 |
| Any size (64, 128, 333, 4,096) with buffering into exact 1,024-sample chunks | 3 of 3 in a 3-frame broadcast stream with 0.3 s gaps |

The browser's AudioWorklet delivers 128-sample blocks, so `GgwaveModem.feed` buffers and hands ggwave exact 1,024-sample chunks.

## Whitened frames that never decode on one salt (Nov 26, 2026, Node, ggwave 0.4.0, 48 kHz, volume 10)

The modem round-trip property tests failed at random (about one run in three). Cause: some whitened frames never decode with one particular salt, every time. Example body `[239,213,1,114,169,202,32,200,168,219]` (data frame, seq 1), all 256 salts tried with a reset modem:

| Speed | Salts that never decode | Every other salt |
| --- | --- | --- |
| NORMAL | 38, 156 (2 of 256) | Decodes exactly |
| FAST | 156 (1 of 256) | Decodes exactly |

No wrong bytes in any try; the failure is always "nothing decoded". This confirms the design choice of a new salt for every broadcast repeat (`resaltFrame`). The tests now assert the design (at least one of 3 salts decodes, never wrong bytes) and keep this frame as a regression test.

## Broadcast and room-echo simulation (Nov 20, 2026, offline)

5 frames × 100 B, 3 cycles, +10 dB white noise, synthetic room echo, 300 ms gaps. Written by Antigravity (`spikes/carousel-sim/run.ts`), re-run by Claude Code. Full report: `docs/research/carousel-sim.md`.

| Finding | Result |
| --- | --- |
| Late joiners (20 random start points in cycle 1, no echo) | 20/20 had all 5 frames by end of cycle 2, at gaps of 0, 100, 300 and 600 ms |
| Listener joins mid-frame | 79/79 recovered that frame on the next cycle |
| Wrong bytes | 0 in every run |
| Echo limit (5 simulated rooms; mean frames out of 5) | FASTEST: 5.0 at RT60 0.2 s, 3.6 at 0.5 s · FAST: 5.0 up to 0.8 s, 1.6 at 1.0 s · NORMAL: 5.0 up to 1.0 s, 2.8 at 1.2 s |

## Kill test (Nov 21): fill in

100-byte message, 10 tries each, FAST protocol at volume 10 unless noted. Run each call row twice: once at FAST, once with "call mode (DT fastest)" at volume 50.

| Date | Sender | Receiver | Channel | Distance | Protocol, volume | Successes / tries | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Laptop | iQOO Neo 6 | Air | 1 m | FAST, 10 | /10 | |
| | Laptop | iQOO Neo 6 | Air | 3 m | FAST, 10 | /10 | |
| | iQOO Neo 6 | Laptop | Bluetooth speaker | 3 m | FAST, 10 | /10 | |
| | iQOO Neo 6 | Vivo P27 | WhatsApp call | n/a | FAST, 10 | /10 | |
| | iQOO Neo 6 | Vivo P27 | WhatsApp call | n/a | DT_FASTEST, 50 | /10 | |
| | iQOO Neo 6 | Vivo P27 | Normal call | n/a | FAST, 10 | /10 | |
| | iQOO Neo 6 | Vivo P27 | Normal call | n/a | DT_FASTEST, 50 | /10 | |

## Field tests (Nov 30 to Dec 1): fill in

See the matrix in `docs/planning/06-architecture.md` (Testing strategy).

| Date | Sender | Receiver | Channel | Distance | Room noise | Successes / tries | Avg time to receive |
| --- | --- | --- | --- | --- | --- | --- | --- |
