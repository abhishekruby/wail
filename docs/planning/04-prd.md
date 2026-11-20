# 04 · Product requirements (PRD)

Stage status: done (Nov 20, 2026) · Owner: Abhishek · Version 1.1 (Nov 20: broadcast made the headline, solo demo added, call mode rule added, after `docs/research/judge-review.md` and `docs/research/codec-sim.md`)

## 1. Summary

Wail is an offline web app that broadcasts short messages, contact cards, locations and notices as sound, from one device to every device in earshot. Category for Kiroween 2026: **Resurrection**.

**What sets it apart.** One-to-one text over sound already exists (Nedagram, Waver). Wail's headline is **one-to-many broadcast**: one phone on a loudspeaker, a room of receivers, and late joiners still get the whole message on a later cycle. It carries structured crisis cards for non-technical people and publishes measured reliability.

## 2. Goals

**v1 must ship (by Dec 1 feature freeze)**

1. **Broadcast mode (the headline):** one sender, any number of receivers, no pairing; a receiver that starts mid-message completes it on the next cycle.
2. Text up to 500 characters, through the air.
3. Cards: contact, location (lat/long), notice (title, time, place).
4. Optional lock with a spoken passphrase; a locked message stays in history and can be unlocked later.
5. Fully offline after first load (installable PWA).
6. Haunted modem UI with a live waterfall spectrogram, chunk progress and a calm mode.
7. **Solo demo:** a judge alone on one laptop can tap "Try it on this device" on the home screen and watch a built-in sample decode through the real decoder, with no second device and no microphone.

**Call mode: promote to v1 if the Nov 21 kill test passes**

- Lab result (`docs/research/codec-sim.md`): ggwave's low-frequency protocol `DT_FASTEST` at volume 50 passed 10/10 through AMR-NB, AMR-WB and Opus; our default AUDIBLE speeds failed AMR-NB 0/10.
- Rule: if the WhatsApp row or the normal-call row of the kill test reaches 7/10 or better using `DT_FASTEST` at volume 50, call mode joins v1 as R15. Otherwise it stays a stretch goal and the video says so.
- The kill-test page only offers AUDIBLE speeds today, so DT_FASTEST and a volume control must be added to `spikes/kill-test.html` before the call rows are run.

**Stretch (only after the freeze checklist passes)**

- Call mode, if the rule above was not met.
- Duplex repair: the receiver plays back which chunks it missed.
- Files up to 2 KB.
- A single-file HTML build that can be shared offline over Bluetooth (to verify: mic access from a local file).

**Non-goals:** images, video, accounts, a server, multi-hop mesh, ultrasound.

## 3. Success metrics

| Metric | Target |
| --- | --- |
| Delivery success, 100-byte message, 1 m, quiet room | ≥ 95% of 20 tries |
| Delivery success, same message, 3 m, normal room noise | ≥ 80% of 20 tries |
| New user: open app to first message received | < 30 s |
| Property-based cases per property per CI run | ≥ 1,000 |
| Broadcast: receivers in one room completing the same message | 3 devices, ≥ 8 of 10 cycles each, 3 m from the speaker |
| Solo demo: home screen to decoded sample on one laptop | < 15 s |
| Kiro Crew nightly torture runs before submission | ≥ 5 (first run by Nov 24, T1.9) |

## 4. Functional requirements (EARS)

Each ID becomes one Kiro spec. Kiro turns EARS acceptance criteria into property-based tests.

| ID | Requirement | Kiro spec |
| --- | --- | --- |
| R1 | WHEN the user taps Wail with a message, THE SYSTEM SHALL start playing the encoded message within 1 s. | 02-packet-protocol |
| R2 | WHILE listening, THE SYSTEM SHALL decode Wail frames from the microphone and show a complete message within 1 s of its last frame. | 01-modem-core |
| R3 | WHEN all frames of a message arrive, THE SYSTEM SHALL verify its CRC-32 and show it only if the check passes. | 02-packet-protocol |
| R4 | IF a frame is missing or corrupt, THEN THE SYSTEM SHALL keep waiting for repeats and SHALL NOT show partial or altered text. | 02-packet-protocol |
| R5 | WHEN broadcast is on, THE SYSTEM SHALL repeat the full frame cycle 3 times or until the sender stops. | 05-broadcast |
| R6 | WHEN a passphrase is set, THE SYSTEM SHALL encrypt the payload before encoding, and only a receiver with the same passphrase SHALL see the text. | 03-crypto |
| R7 | IF decryption fails, THEN THE SYSTEM SHALL show "Locked message", SHALL NOT show ciphertext as text, and SHALL keep the locked payload in history so the user can enter the passphrase later. | 03-crypto |
| R8 | WHEN the user picks a card (contact, location, notice), THE SYSTEM SHALL serialise it compactly and render it as a card on receive. | 04-cards |
| R9 | WHEN a message is sent or received, THE SYSTEM SHALL save it to on-device history with time, direction and status. | 06-storage |
| R10 | WHILE the microphone is on, THE SYSTEM SHALL show a listening indicator, and SHALL stop capture when the user leaves the Listen screen. | 01-modem-core |
| R11 | WHEN offline after the first visit, THE SYSTEM SHALL load and run fully from cache. | 07-pwa-offline |
| R12 | WHEN a message arrives, THE SYSTEM SHALL also vibrate (where supported) and show it as text. | 08-haunted-ui |
| R13 | IF the same message_id was already completed in the last 10 minutes, THEN THE SYSTEM SHALL not show it again. | 02-packet-protocol |
| R14 | WHEN the user taps "Try it on this device", THE SYSTEM SHALL decode a built-in sample recording through the real ggwave decoder, with the live spectrogram, and show the message within 15 s, without needing a microphone. | 08-haunted-ui |
| R15 | *(only if call mode is promoted)* WHERE call mode is selected, THE SYSTEM SHALL send with the low-frequency protocol and volume set in `.kiro/steering/protocol.md`, and the receiver SHALL decode it without the user picking a mode. | 01-modem-core |

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Offline | No network calls after load; CSP `connect-src 'self'` |
| Browsers | Android Chrome (primary), desktop Chrome, iOS Safari 16.4+ (best effort) |
| Size | First load < 400 KB gzipped including ggwave WASM |
| Privacy | No analytics, no accounts, no third-party scripts |
| Accessibility | WCAG 2.1 AA contrast: every text colour ≥ 4.5:1 on its background (measured, see 07); keyboard reachable, text for every sound event, calm mode |
| Reliability | Every audio error (no permission, device busy) shown as plain words |
| Licence | MIT, visible in the GitHub About section |

## 6. Out of scope for v1

Accounts, servers, sync, contacts directory, read receipts, group chat, translations beyond English.

## 7. Release criteria (Dec 1 freeze checklist)

- [ ] R1 to R14 pass their tests (R15 too if call mode was promoted)
- [ ] Solo demo works on a fresh laptop with no microphone permission granted
- [ ] README names Nedagram, Waver and ggwave as prior art
- [ ] Property suites P1 to P7 green, noise suite at baseline
- [ ] Field-test table filled with real numbers
- [ ] Lighthouse PWA installable, offline reload works
- [ ] Live on Vercel over HTTPS

## 8. Open questions

- ~~Is India eligible?~~ Checked Nov 20: India is not on the excluded list in the official rules.
- ~~What is ggwave's real payload limit?~~ Answered Nov 20: 140 bytes per transmission, longer input silently truncated. Wail uses 128-byte frames.
- Does the signal survive real rooms and phone calls? Partly answered Nov 20 by the offline codec simulation (call mode needs `DT_FASTEST` at volume 50); real rooms and calls decided by the Nov 21 kill test.
- ~~Which second phone?~~ Test devices: iQOO Neo 6 (own), Vivo P27 (mother's), Samsung (father's), Lenovo laptop.
- Not eligible for Ghost of Kiroween Past (first Kiroween).
