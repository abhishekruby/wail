# Wail

> **Draft (Gemini, checked by Claude Code on Nov 25).** Every feature below must actually work before this is submitted; delete any line whose feature didn't ship. Fill every `[TBD]` from real results.

*Broadcast a short message to every device in the room, as sound. No internet, no SIM data, no pairing.*

## Inspiration

When mobile data goes down, people lose the channel they use for everything. In 2025, India recorded 65 internet shutdowns, the highest among democracies (Access Now). In Manipur, a 2023 blackout lasted 212 days (TIME / Access Now). Worldwide, government shutdowns cost an estimated $19.7 billion across 28 countries in 2025 (Top10VPN).

Disasters cut the same cord without any government order. Cyclone Fani disrupted 6,058 mobile towers in Odisha in 2019 (CDRI study), and about 1.1 million people in India were evacuated from the coast (IFRC). During the 2018 Kerala floods, 23,552 of 85,900 mobile towers went offline (DoT).

Even in a blackout, loudspeakers and phone microphones still work. The dial-up modem died in the 2000s. For Kiroween 2026 (**Resurrection**), we dug it up so one phone on a speaker can send exact text to a whole room.

## What it does

Wail is an offline web app for relief teams, clinics, and local organisers. Open the page once while online; after that, it runs from cache with zero network calls.

- **Room broadcast:** One sender plays a message as tones over a phone speaker or PA system. Every nearby device with Wail open decodes it at once. A 3-cycle repeat loop lets late listeners finish the whole message.
- **Crisis cards:** Compact notices, GPS locations, and contacts, plus text up to 500 characters.
- **Exact or nothing:** Per-frame CRC-16 and full-message CRC-32 drop any damaged data.
- **Passphrase lock:** Encrypts private notes (such as patient referrals) with PBKDF2-SHA-256 and AES-GCM-256. Locked items stay in history so receivers can enter the passphrase later.
- **Solo demo for judges:** On one laptop, tap **"Try it on this device"** on the home screen. Wail decodes a built-in sample through the real decoder and live waterfall spectrogram in under 15 seconds, with no microphone or second phone needed.

## How we built it

Wail is a static TypeScript and Preact PWA using `ggwave` 0.4.0 (WebAssembly FSK + Reed-Solomon), Web Audio `AudioWorklet`, Web Crypto, `CompressionStream`, and IndexedDB.

We built it in **Kiro**:

- **Steering (`.kiro/steering/`):** Six files enforce pure protocol layers, audio-thread rules, WCAG AA contrast, and frame invariants.
- **Specs (`.kiro/specs/`):** Each EARS requirement (`R1`–`R14`, plus `[TBD: R15 call mode]`) becomes a Kiro spec (`requirements → design → tasks`). `[TBD: Kiro spec workflow highlights]`.
- **Property-based tests (`fast-check` + Vitest):** `[TBD: which properties Kiro wrote and how many runs; only list suites that exist]`. `[TBD: bugs caught by Kiro property tests]`.
- **Hooks & MCP:** `[TBD: hooks actually created, what each caught; MCP servers actually used (Context7, Playwright) and for what]`. `[TBD: custom agent details]`.
- **Kiro Crew (`wail-nightwatch`):** `[TBD: only if built; otherwise delete this line]`.

*Disclosure:* Planning docs, steering drafts, and `spikes/` simulations predated Kiro credits. All product code in `src/` was built with Kiro.

## Challenges

A baseline `fast-check` test caught `ggwave` returning **wrong bytes with no error** on a clean signal for short payloads (`[0, 80]` decoded as `[0, 0]`) and zero runs (33 zero bytes at fastest speed). Plain repeats cannot fix a deterministic bug. We enforced a 12-byte minimum frame, XOR-whitened frames with a fresh 1-byte salt per repeat, and added CRC-16 per frame.

Room echo was the second trap. Offline simulations showed `AUDIBLE_FASTEST` breaks at `RT60 = 0.5 s`, whereas `AUDIBLE_FAST` holds 5.0/5 frames up to `RT60 = 0.8 s`. Static echo nulls block the same frame on every repeat, so Wail tells stuck listeners to move their phone a hand's width. Physical room and call challenges: `[TBD: field test]`.

## Accomplishments

- Defeated silent modem corruption: at `FAST` in the lab, 4 of 585 pattern frames failed on their first salt, all 4 recovered on another salt, and 0 failed all three (`docs/field-tests.md`).
- Proved late-joiner broadcast recovery in simulation: 20 of 20 random Cycle-1 joiners got all 5 frames by Cycle 2, and 79 of 79 mid-frame joiners recovered that frame next cycle (`docs/field-tests.md`).
- Found a lab path for phone codecs: `DT_FASTEST` at volume 50 scored 10/10 across AMR-NB, AMR-WB, and Opus, whereas default `AUDIBLE` modes scored 0/10 on AMR-NB (`docs/field-tests.md`).
- Real-room and phone-call results across four devices: `[TBD: field test]`.

## What we learned

Acoustic modems fail differently from network sockets: checksums are mandatory, room echo hurts sooner than white noise, and fast wire settings break indoors. `[TBD: lessons from Kiro specs and field testing]`.

## What's next

- Duplex repair so receivers chirp back missing frame numbers.
- `[TBD: call mode, depending on the kill test]`.
- Hindi and Odia labels for field volunteers.

## Prior art

We build on existing open work:

- **ggwave and Waver** (Georgi Gerganov, MIT): the modem library Wail uses, and its demo app. Wail adds the broadcast and crisis layer on top.
- **Chirp**: proved data-over-sound commercially before Sonos acquired it in Feb 2020 and withdrew its public SDKs in Mar 2020.
- **Nedagram** (open source, 2026): the closest app. It is already an offline PWA with compression, encryption, error correction, and a phone mode, built for **one-to-one** transfer of configs, passwords, and keys.

Wail differs in purpose: **one-to-many room broadcast**, a repeating carousel for late joiners, crisis cards for non-technical people, salted whitening over `ggwave`, and published field reliability (`docs/field-tests.md`).
