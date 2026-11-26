# 06 · System architecture

Stage status: done (Nov 20, 2026) · Nov 26: game layer added for Séance (`11-seance-game-design.md`); relay, groups, cards and call mode removed

Wail is client-only and layered. A message goes **down** six layers on the sender, crosses the air as sound, and goes **up** the same six layers on every receiver. Only sound leaves the device.

```
 ┌──────────────── Wail PWA on each device ────────────────┐
 │                                                          │
 │  UI (Preact)  Host · Player · Play alone  ──── Service worker (offline)
 │      ↕                                                   │
 │  Game (ours)  rules, roles, clues, rounds, key exchange  │
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
| UI | `src/ui/` | Host, Player and Play alone screens, theme, level meter, calm mode | Game |
| Game | `src/game/` | Pure rules engine (roles, clues, rounds, win check) and game message encode/decode | Pipeline, packet |
| Broadcast | `src/app/` | Carousel: 3 cycles, new salt per repeat, 300 ms gaps | Packet, modem |
| Payload pipeline | `src/pipeline/` | lock/unlock (passphrase), ECDH key exchange and per-player AES-GCM | Web Crypto |
| Packet layer | `src/protocol/` | Frame encode/decode, chunking, reassembly, CRC-32, replay guard | none (pure) |
| Modem adapter | `src/modem/` | Wraps ggwave behind the `Modem` interface | ggwave |
| Audio I/O | `src/audio/` | Mic worklet, playback, analyser | Web Audio API |

The packet layer and the game rules are pure TypeScript with no browser APIs, so they are fully testable in Node.

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
  - Simulation (`docs/research/carousel-sim.md`, Nov 20): a listener who joins anywhere in cycle 1, even mid-frame, had every frame by the end of cycle 2 (79/79 mid-frame joins), with 0 wrong bytes. Gaps of 0 to 600 ms all worked; keep 300 ms for real speakers and mic gain.
  - Room echo: FAST was clean up to RT60 0.8 s and NORMAL up to 1.0 s; **FASTEST already failed at 0.5 s**, so FASTEST is never used for room broadcast. In a very echoey hall, extra cycles don't help a phone stuck in an echo null; moving the phone 15 to 30 cm or switching to NORMAL does.
- **Duplex repair (stretch).** The receiver plays a repair-request frame listing missing seq numbers; the sender replays only those.


## Game messages (Séance)

All game messages are ordinary Wail payloads (kind 0, broadcast flag set), so they get the carousel, CRC-32 and replay guard for free. The first byte of the payload is the game message type.

| Type | Sent by | Body | Size |
| --- | --- | --- | --- |
| join | Player, once | player public key (ECDH P-256, raw, 65 B) | 66 B: 1 frame |
| possession | Host | game id (2), host public key (65), player count, then per player: key fingerprint (first 4 B of SHA-256 of the player key) + AES-GCM(role and possessed partner, 2 B) + tag (16) | about 70 + 22 per player: 160–250 B, 2–3 frames |
| omen | Host | game id, round, per living player: fingerprint + AES-GCM(clue, about 3 B) + tag | up to about 200 B |
| reveal | Host | game id, banished candle, role (in the clear: it is public now) | 1 frame |
| end | Host | game id, winner, every role in the clear | 1 frame |

- **Keys:** each side derives a per-player AES-GCM-256 key with ECDH (host private key + player public key) and HKDF-SHA-256. The IV is built from game id, round and candle number, so it never repeats under one key and needs no bytes on the air. Keys are non-extractable and live in memory for one game.
- **Which part is mine:** a phone finds its entry by its key fingerprint, and its candle number is the entry's position.
- **Join chirps** are a single FAST frame (about 4 s). The host decodes one at a time; two chirps at once garble and both players retry.

**Air time (lab, Nov 20):** a 100-character text is one manifest frame plus one data frame, about 9 s per cycle at FAST and about 5 s at FASTEST. Broadcast repeats 3 cycles. A possession message for 8 players is 3 data frames, about 25 s per cycle at FAST.

## Data design (on the device)

IndexedDB database `wail`, version 1:

| Store | Key | Fields | Notes |
| --- | --- | --- | --- |
| transfers | message_id | total_frames, received (seq list), frames (seq → bytes), first_seen_at, last_seen_at | Deleted on success or 10 min after the last frame |
| settings | key | value | Volume, speed, calm mode. No game state is stored: a game lives in memory only |

Keys live in memory only, for one game.

## Security

| Threat | Answer |
| --- | --- |
| Reading another player's role | ECDH per player + AES-GCM; a phone listening to joins hears only public keys |
| Eavesdropping (engine lock, not used by the game UI) | PBKDF2-SHA-256 (310,000 iterations, 16-byte salt per message) → AES-GCM-256 |
| Tampering | AES-GCM tag on locked messages; CRC-32 on all (accidents only), so unlocked messages show "unverified sender" |
| Replay | message_id ignored if completed in the last 10 minutes (R13) |
| Data leaks | No backend, CSP blocks outside calls, no analytics |
| A fake host | Out of scope: players are in the same room and can see who the host is |
| Mic left on | Capture only while the host is summoning or a player is waiting for the ghost, with an indicator |

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
| G1 | For any player count 4–8 and seed: exactly the right number of Possessed, never 0 | R22 |
| G2 | Every clue given to a Living player is true | R23 |
| G3 | Each phone decrypts its own role and fails cleanly on every other entry | R21, R22 |
| G4 | Any sequence of banishments ends the game, and the winner matches the rules | R25 |
| G5 | A late joiner still gets the possession message on the next cycle | R5, R22 |

**Noise suite (Node):** ggwave encodes a frame, we add white noise and echo at fixed SNR levels, decode, and record the success rate per level. CI fails if it drops below the baseline.

**End to end (Playwright):** Chromium runs with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`, so the Listen flow is tested with a real recording.

**Field-test matrix (results in `docs/field-tests.md`)**

| Sender | Receiver | Channel | Distances | Tries each |
| --- | --- | --- | --- | --- |
| iQOO Neo 6, Vivo P27, Samsung (players) | Laptop (host) | Join chirps, one after another | 1 m, 2 m | 10 each |
| Laptop (host, on its speaker) | 3–4 phones at once | Possession broadcast, quiet room | 2 m, 4 m | 10 games |
| Laptop (host) | 3–4 phones at once | Possession broadcast, people talking | 2 m | 10 games |
| Laptop | Laptop (Play alone) | In memory, no mic | n/a | 10 |

## Deployment

GitHub `main` → Vercel static deploy (HTTPS). Preview deploys for every PR. No environment variables or secrets in the app.
