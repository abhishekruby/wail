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

## Kill test (Nov 21): fill in

100-byte message, 10 tries each, FAST protocol unless noted.

| Date | Sender | Receiver | Channel | Distance | Successes / tries | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | Laptop | iQOO Neo 6 | Air | 1 m | /10 | |
| | Laptop | iQOO Neo 6 | Air | 3 m | /10 | |
| | iQOO Neo 6 | Laptop | Bluetooth speaker | 3 m | /10 | |
| | iQOO Neo 6 | Vivo P27 | WhatsApp call | n/a | /10 | |
| | iQOO Neo 6 | Vivo P27 | Normal call | n/a | /10 | |

## Field tests (Nov 30 to Dec 1): fill in

See the matrix in `docs/planning/06-architecture.md` (Testing strategy).

| Date | Sender | Receiver | Channel | Distance | Room noise | Successes / tries | Avg time to receive |
| --- | --- | --- | --- | --- | --- | --- | --- |
