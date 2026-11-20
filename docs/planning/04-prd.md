# 04 · Product requirements (PRD)

Stage status: done (Nov 20, 2026) · Owner: Abhishek · Version 1.0

## 1. Summary

Wail is an offline web app that sends short messages, contact cards, locations and notices between devices as sound. Category for Kiroween 2026: **Resurrection**.

## 2. Goals

**v1 must ship (by Dec 1 feature freeze)**

1. Text up to 500 characters, device to device, through the air.
2. Broadcast mode: one sender, any number of receivers, no pairing.
3. Cards: contact, location (lat/long), notice (title, time, place).
4. Optional lock with a spoken passphrase.
5. Fully offline after first load (installable PWA).
6. Haunted modem UI with a live spectrogram, chunk progress and a calm mode.

**Stretch (only after the freeze checklist passes)**

- Over a phone or WhatsApp call (decided by the Nov 21 kill test).
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
| Kiro Crew nightly torture runs before submission | ≥ 5 |

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
| R7 | IF decryption fails, THEN THE SYSTEM SHALL show "Locked message" and SHALL NOT show ciphertext as text. | 03-crypto |
| R8 | WHEN the user picks a card (contact, location, notice), THE SYSTEM SHALL serialise it compactly and render it as a card on receive. | 04-cards |
| R9 | WHEN a message is sent or received, THE SYSTEM SHALL save it to on-device history with time, direction and status. | 06-storage |
| R10 | WHILE the microphone is on, THE SYSTEM SHALL show a listening indicator, and SHALL stop capture when the user leaves the Listen screen. | 01-modem-core |
| R11 | WHEN offline after the first visit, THE SYSTEM SHALL load and run fully from cache. | 07-pwa-offline |
| R12 | WHEN a message arrives, THE SYSTEM SHALL also vibrate (where supported) and show it as text. | 08-haunted-ui |
| R13 | IF the same message_id was already completed in the last 10 minutes, THEN THE SYSTEM SHALL not show it again. | 02-packet-protocol |

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Offline | No network calls after load; CSP `connect-src 'self'` |
| Browsers | Android Chrome (primary), desktop Chrome, iOS Safari 16.4+ (best effort) |
| Size | First load < 400 KB gzipped including ggwave WASM |
| Privacy | No analytics, no accounts, no third-party scripts |
| Accessibility | WCAG 2.1 AA contrast, keyboard reachable, text for every sound event, calm mode |
| Reliability | Every audio error (no permission, device busy) shown as plain words |
| Licence | MIT, visible in the GitHub About section |

## 6. Out of scope for v1

Accounts, servers, sync, contacts directory, read receipts, group chat, translations beyond English.

## 7. Release criteria (Dec 1 freeze checklist)

- [ ] R1 to R13 pass their tests
- [ ] Property suites P1 to P7 green, noise suite at baseline
- [ ] Field-test table filled with real numbers
- [ ] Lighthouse PWA installable, offline reload works
- [ ] Live on Vercel over HTTPS

## 8. Open questions

- ~~Is India eligible?~~ Checked Nov 20: India is not on the excluded list in the official rules.
- ~~What is ggwave's real payload limit?~~ Answered Nov 20: 140 bytes per transmission, longer input silently truncated. Wail uses 128-byte frames.
- Does the signal survive real rooms and phone calls? (Day-1 kill test.)
- ~~Which second phone?~~ Test devices: iQOO Neo 6 (own), Vivo P27 (mother's), Samsung (father's), Lenovo laptop.
- Not eligible for Ghost of Kiroween Past (first Kiroween).
