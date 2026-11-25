# dev.to Blog Post Outline · Wail

- **Working title options:**
  - *Digging Up the Dial-Up Modem for Blackouts: Building Wail with Kiro*
  - *What Property-Based Testing Caught Inside an Audio Modem (Building Wail for Kiroween 2026)*
- **Suggested tags:** `#kiroween`, `#webdev`, `#typescript`, `#pwa`

---

## Required Hackathon Disclosure Banner (top of post)

- Explicit line in the opening paragraph (required for the Bonus Blog prize): *"This post was written as part of the **Kiroween 2026 hackathon** (category: **Resurrection**)."*
- Links to include at top: Live app (`[TBD]`), `wail` GitHub repo (`[TBD]`), `wail-nightwatch` Kiro Crew repo (`[TBD]`).

---

## 1. Why Resurrect the Acoustic Modem?

- `[ABHISHEK: your own story here — why internet shutdowns or disaster blackouts in India felt personal or worth solving, and the moment you thought of sending notices over a loudspeaker]`
- Verified context to cite briefly (with links):
  - India recorded 65 internet shutdowns in 2025, highest among democracies (Access Now), and a 212-day blackout in Manipur in 2023 (TIME / Access Now).
  - Natural disasters cut the same channel: Cyclone Fani disrupted 6,058 mobile towers in Odisha (CDRI study), and the 2018 Kerala floods took down 23,552 of 85,900 towers (DoT).
- Core thesis: loudspeakers and phone microphones still work when towers die, so one phone on a speaker can broadcast exact text to a whole room.
- Honest scope boundary: open the PWA once online before a blackout; ~10 to 28 B/s raw means short critical notices and cards, not chat or photos.

---

## 2. Prior Art — and What Actually Needed to Be Built

- Name existing work upfront rather than pretending data-over-sound is new:
  - `ggwave` / Waver (Georgi Gerganov, MIT): WebAssembly FSK + Reed-Solomon modem Wail builds on.
  - Chirp: proved data-over-sound commercially, acquired by Sonos in Feb 2020, public SDKs withdrawn in Mar 2020.
  - Nedagram (open source, 2026): offline PWA for 1-to-1 encrypted text over sound and phone calls, aimed at configs, passwords, and keys.
- Where Wail differs:
  - One-to-many repeating broadcast carousel so late-joining phones complete the message on the next cycle.
  - Structured crisis cards (notice, location, contact) and plain-language states for non-technical users.
  - Solo one-laptop demo (`"Try it on this device"`) and published reliability numbers.

---

## 3. Finding #1: Catching Silent Corruption in `ggwave` with Property-Based Tests

- Why we tested the modem before trusting it (`tests/ggwave-baseline.test.ts` + `docs/field-tests.md`):
  - Hard 140-byte truncation limit (141+ bytes cut silently with no error).
  - `fast-check` found `ggwave` returning **wrong bytes with no error** on a clean signal: short payloads (`[0, 80]` → `[0, 0]`) and low-entropy zero runs (33 zero bytes at `FASTEST` failed every time).
- Why naive repeats fail on a deterministic bug, and how the protocol solves it:
  - 1-byte clear `salt` (fresh on every repeat) + xorshift32 XOR whitening + 12-byte minimum frame + per-frame CRC-16 + full-message CRC-32.
  - Lab check at `FAST`: 4 of 585 pattern frames failed on their first salt, all 4 decoded with another salt, 0 failed all three.
- `[ABHISHEK: your own story here — your reaction when the property test shrunk a clean signal failure down to [0, 80], and how that changed how you wrote the Kiro specs]`

---

## 4. Finding #2: Simulating Room Echo, Late Joiners, and Phone Codecs Before Field Day

- Broadcast carousel & room-echo simulation (`docs/research/carousel-sim.md`):
  - 20 of 20 random Cycle-1 late joiners recovered all 5 frames by the end of Cycle 2; 79 of 79 mid-frame joiners recovered the clipped frame on the next cycle.
  - Why `AUDIBLE_FASTEST` was dropped as default: breaks at `RT60 = 0.5 s` (3.6/5 frames), while `AUDIBLE_FAST` holds 5.0/5 up to `RT60 = 0.8 s`.
  - Why stuck receivers must move their phone a hand's width: static room comb-filter nulls block the same frame across cycles (`Cycle 2 === Cycle 3`).
- Phone-call codec simulation (`docs/research/codec-sim.md`):
  - Default `AUDIBLE` modes pass AMR-WB (VoLTE) and Opus 10/10, but score 0/10 on narrowband 8 kHz AMR-NB calls.
  - Low-frequency `DT_FASTEST` at volume 50 scored 10/10 across AMR-NB, AMR-WB, and Opus in the lab (necessary, not sufficient—real calls add VAD/NS/AGC).

---

## 5. Building Wail with Kiro (IDE, CLI, Specs, Steering, Hooks, and Crew)

- Disclosure of pre-Kiro planning/research vs. Kiro-built product code in `src/`.
- Steering strategy (`.kiro/steering/`):
  - Keeping `src/protocol/` and `src/pipeline/` pure Node-testable TypeScript; enforcing `AudioWorklet` + mic constraints (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`); fixing WCAG AA contrast (`#3f7f52` at 4.02:1 → `#56a86e` at 6.64:1).
- Spec-driven workflow (`.kiro/specs/`):
  - Turning EARS requirements (`R1`–`R14`, `[TBD: R15]`) into design docs, tasks, and named property tests (`P1`–`P10`).
  - `[ABHISHEK: your own story here — specific moments where Kiro specs beat vibe coding, what you had to edit in Kiro's generated design/tasks, and any bug Kiro's property tests or hooks caught]`
- Hooks, MCP (Context7 + Playwright), Kiro CLI, and Custom Agent / Powers:
  - `[TBD: exact hooks, CLI commands, and custom agent workflow used during build]`
- Kiro Crew (`wail-nightwatch`):
  - Nightly Python torture suite running frames through noise and echo (`[TBD: nightly run count and screenshot]`).
  - `[ABHISHEK: your own story here — how Kiro IDE, Kiro CLI, and Kiro Crew felt different in day-to-day use]`

---

## 6. Real-World Kill Test & Field Results Across Indian Phones

- Test setup: Lenovo laptop, iQOO Neo 6, Vivo P27, and Samsung phone across quiet rooms, noisy rooms, Bluetooth/PA speaker broadcast, and calls (`docs/field-tests.md`).
- Measured table summary:
  - 1 m & 3 m air: `[TBD: field test]`
  - 3-device room broadcast over speaker: `[TBD: field test]`
  - WhatsApp & normal voice call (`FAST` vs `DT_FASTEST` vol 50): `[TBD: field test]`
- `[ABHISHEK: your own story here — what surprised you when testing with real speakers, family phones, and room noise, and what broke vs. worked]`

---

## 7. Try It & What's Next

- How readers can test Wail in 15 seconds on a single laptop (`"Try it on this device"`) or between two phones in airplane mode: `[TBD: live Vercel URL]`.
- Next steps: duplex missing-chunk repair, `[TBD: call mode follow-up]`, and Hindi/Odia field copy.
- Closing reflection: `[ABHISHEK: your own closing takeaway from Kiroween 2026]`
