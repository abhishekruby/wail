# Wail · Demo Video Voiceover & Captions (2:50)

Matches the shot table in `docs/planning/10-submission-plan.md` exactly.
- **Total length:** `2:50` (under the `3:00` limit).
- **Audio note:** Lower the modem broadcast tones to around `−18 dB` in the edit so they never hurt on headphones. Use no third-party music.
- **Screen safety:** Use only an obviously fictional phone number on screen (for example `PHC: 00000-00000`).
- **Pacing:** Every spoken sentence is **12 words or fewer** (~185 spoken words across `2:45` of speech + `0:05` of pure tone playback, a relaxed ~70 wpm pace with pauses).

---

## Shot 1 · `0:00–0:15` · Cold open (one phone on a speaker, three devices in airplane mode)

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `0:00–0:04` | Close-up of four devices; airplane-mode icons clearly visible; one phone wired to a portable battery speaker. | No internet. No SIM data. Airplane mode is on. Watch. | No internet. No SIM data. Airplane mode is on. Watch. |
| `0:04–0:09` | Sender taps **Wail it** (`FAST` speed, ~16 B notice, ~4 s of sound). Waterfall spectrogram lights up on all three listening devices. | *(no speech — let the lowered modem tones play)* | *[Modem broadcast tones playing — 4 s]* |
| `0:09–0:15` | All three screens vibrate and reveal the exact same shelter card together. | One phone spoke. All three devices got the exact shelter notice. | One phone spoke. All three devices got the exact shelter notice. |

---

## Shot 2 · `0:15–0:40` · Problem (three verified facts + disasters)

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `0:15–0:21` | Card 1 on dark CRT screen: `Manipur, 2023: the internet was shut off for 212 days. (TIME / Access Now)` | In 2023, Manipur lost mobile internet for 212 days. | In 2023, Manipur lost mobile internet for 212 days. |
| `0:21–0:27` | Card 2: `Cyclone Fani disrupted 6,058 mobile towers in Odisha. (CDRI study)` | Cyclone Fani disrupted 6,058 mobile towers in Odisha. | Cyclone Fani disrupted 6,058 mobile towers in Odisha. |
| `0:27–0:33` | Card 3: `Kerala floods, 2018: 23,552 mobile towers went down. (DoT)` | The 2018 Kerala floods took down 23,552 mobile towers. | Kerala floods, 2018: 23,552 mobile towers went down. |
| `0:33–0:40` | Cut back to the battery speaker and phones on the table. | When networks die, loudspeakers still work. So we revived the acoustic modem. | When networks die, loudspeakers still work. We revived the acoustic modem. |

---

## Shot 3 · `0:40–1:20` · Product (late joiner, locked referral, location card, offline reload)

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `0:40–0:48` | Odisha shelter demo: Compose screen showing Notice + Location card (`Govt High School, Ward 4 · 20.5734, 86.7128 · PHC: 00000-00000`) with **Broadcast (3×)** on. | Meet Wail. A coordinator broadcasts a shelter notice and GPS card. | Meet Wail: broadcast a shelter notice + GPS card. |
| `0:48–0:58` | Fourth phone taps **Listen** mid-cycle (`2 of 3 frames`), waits for the next repeat, and fills all dots (`3 of 3`). | This fourth phone joined halfway through. It catches the missing part next cycle. | Joined mid-broadcast → completes on the next cycle. |
| `0:58–1:05` | Zoom on `CRC-32 OK` badge on the received location card. | Every frame has a checksum. Damaged text is never shown. | CRC-16 per frame + CRC-32 per message. Exact or nothing. |
| `1:05–1:13` | Sender toggles **Lock**, sends a patient referral note 1-to-1; receiver taps the locked item in Crypt and enters the passphrase to unlock. | For clinic referrals, a spoken passphrase locks the message with AES. | Optional AES-GCM passphrase lock for private referrals. |
| `1:13–1:20` | Swipe-close Chrome with Airplane Mode still visible, tap the installed Wail icon, and show the app loading cleanly from cache. | Close the browser in airplane mode. Reopen it, and Wail still loads. | Works fully offline after the first visit (PWA). |

---

## Shot 4 · `1:20–1:45` · Why it is different & Solo Demo for Judges

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `1:20–1:28` | Clean comparison graphic: `1-to-1 (Nedagram, Waver)` vs `1-to-room carousel (Wail)`. | Apps like Nedagram and Waver send sound between two people. | Prior art (Nedagram, Waver): one sender to one receiver. |
| `1:28–1:35` | Highlight Wail's repeating carousel + crisis cards on three phones. | Wail broadcasts from one speaker to a whole room of phones. | Wail: one speaker to a whole room, built for late joiners. |
| `1:35–1:45` | Single laptop screen, no mic permission prompt: cursor clicks **Try it on this device**; waterfall writes and `"Shelter moved to Govt School, Ward 4"` appears in under 15 s. | Judges, you only need one laptop. Tap Try it on this device. | Judges: on one laptop, tap "Try it on this device". |

---

## Shot 5 · `1:45–2:25` · How Kiro built it (two zoomed, readable moments)

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `1:45–1:53` | Zoomed Kiro IDE view showing `.kiro/specs/` and `.kiro/steering/protocol.md` (`[TBD: final Kiro IDE recording]`). | We built Wail in Kiro using specs, steering, hooks, and property tests. | Built with Kiro: specs, steering, hooks, and property tests. |
| `1:53–2:05` | Zoomed terminal/test pane: `fast-check` shrinking `[0, 80]` decoding as `[0, 0]` in `ggwave` with no error. | A property test caught ggwave returning wrong bytes with no error. | Property test caught ggwave returning wrong bytes silently. |
| `2:05–2:14` | Zoomed spec task diff showing per-repeat salted whitening + CRC-16 (`4/4` failed frames recovered across 3 salts in lab). | Our spec told Kiro to add salted whitening and frame checks. | Fix in spec: per-repeat salted whitening + CRC-16. |
| `2:14–2:25` | **Only if the Crew app ships** (it is a "could" item in the Nov 25 schedule): zoomed Kiro Crew panel (`wail-nightwatch`) showing the nightly noise and echo trend report (`[TBD: screenshot]`). **Otherwise:** a Kiro hook firing on save and running the protocol property tests, with this line instead: "Every save, a Kiro hook reruns our protocol tests." | Every night, our Kiro Crew app tests frames against noise and echo. | Kiro Crew (`wail-nightwatch`): nightly noise & echo torture runs. |

---

## Shot 6 · `2:25–2:50` · Proof and close

| Time | Visual / Action | Spoken Voiceover (≤ 12 words/sentence) | On-Screen Caption |
| --- | --- | --- | --- |
| `2:25–2:34` | Show `docs/field-tests.md` table (`1 m: [TBD: field test]`, `3 m: [TBD: field test]`, `Speaker broadcast: [TBD: field test]`, plus call row if shipped). | We tested Wail across real phones, speakers, and noisy rooms. | Measured on real devices: `[TBD: field test]` (`docs/field-tests.md`). |
| `2:34–2:42` | Highlight repository path `docs/field-tests.md` and MIT licence badge. | Every success rate is published openly in our repository. | Every test result published in `docs/field-tests.md` (MIT). |
| `2:42–2:50` | End card (`docs/assets/devpost-cover.svg` style): live URL `[TBD]`, GitHub repo link `[TBD]`, `Kiroween 2026 · Resurrection`. | When the internet goes dark, sound still travels. Try Wail today. | Sound still travels. Live URL: `[TBD]` · GitHub: `[TBD]` |
