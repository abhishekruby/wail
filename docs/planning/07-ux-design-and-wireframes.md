# 07 · UI/UX design and wireframes

Stage status: done (Nov 20, 2026). Low-fidelity wireframes: open `wireframes.html` in this folder in any browser.

## Design direction: "a 1990s modem terminal at midnight"

The Halloween theme is built into what the app does: the scream of the modem *is* the message, and the spectrogram is where the ghost appears. The effects never cost readability.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0b0f0c` | Near-black background |
| `--phosphor` | `#7CFF9E` | Primary text and the signal trace |
| `--phosphor-dim` | `#56a86e` | Secondary text, borders (was `#3f7f52`, which measured 4.02:1 and failed AA) |
| `--ember` | `#FFB347` | Warnings, "locked", "unverified sender" |
| `--blood` | `#FF5C5C` | Errors only |
| Font, UI | `"IBM Plex Mono", ui-monospace, monospace` (self-hosted, offline) | Everything |
| Body size | 16 px minimum; message text 18 px | Readability |
| Radius | 8 px | Buttons, cards |
| Effects | CRT scanlines at 6% opacity, slight glow on the trace | Off in calm mode |

Contrast on `--bg`, measured Nov 20 (WCAG 2.1 formula): `--phosphor` 15.3:1, `--phosphor-dim` 6.6:1, `#d9ffe4` body text 17.8:1. All pass AA 4.5:1. Re-measure any new colour pair before using it for text.

`.kiro/steering/haunted-ui.md` still lists the old `#3f7f52`; update it to `#56a86e` before Kiro builds the theme (T2.2).

## Screens

| Screen | Purpose | Main elements |
| --- | --- | --- |
| **Séance** · Home | Listen and send from one place | Big "Listen" and "Wail" buttons, "Try it on this device" (solo demo, R14), live waterfall spectrogram, signal meter, last 5 messages |
| **Compose** | Write a message or a card | Text box with byte counter and air-time estimate, card picker, Lock toggle + passphrase, Broadcast toggle, "Wail it" button |
| **Crypt** · History | Past messages | Newest first, direction icon, time, status chip (received, locked, sent), tap to open; tap a locked message to enter its passphrase |
| **Altar** · Settings | Tune and test | Volume, speed (normal/fast; call mode if promoted), calm mode, self-test, clear history, about + credits (ggwave, prior art) |

Every nav label shows the plain word under the spooky one (for example "Crypt" with "History" beneath), so a nurse or relief worker never has to guess. The theme stays because it is the Resurrection story; the plain words make it usable.

**Spectrogram:** a scrolling time-frequency waterfall (`AnalyserNode.getByteFrequencyData` drawn line by line on a canvas), with the active tone band bracketed, so the "ghost" visibly writes itself. Calm mode replaces it with a static progress bar.

## Key flows

**Send:** Séance → Wail → type → Wail it → handshake sound → frames play → "Sent (3 cycles)".

**Receive:** Séance → Listen → allow mic once → spectrogram rises → chunk dots fill → checksum OK → vibrate + message rises out of the static.

**Broadcast:** Compose → Broadcast on → Wail it → repeats 3 times → "Anyone in earshot has it".

**Locked:** both agree a passphrase out loud → sender locks → receiver enters it in Listen → text shows. Wrong or no passphrase → "Locked message from the other side", saved in Crypt; tap it later and enter the passphrase to open it.

**Solo demo (one device, no mic):** Séance → Try it on this device → a built-in sample plays through the real decoder → spectrogram writes → "Shelter moved to Govt School, Ward 4" rises out of the static in under 15 s → a line below: "Now open Wail on a second phone and press Listen."

## States every screen must handle

| State | What the user sees |
| --- | --- |
| Mic permission not asked | "Wail listens only while this screen is open." + Allow button |
| Mic denied | Plain steps to re-enable in Chrome settings |
| Listening, nothing heard | Flat trace, "Listening… hold the devices closer or turn the volume up" |
| Receiving | Chunk dots: 3 of 5, live |
| Checksum failed | Nothing shown; "Heard something, but it was damaged. Waiting for the repeat." |
| Offline first load failed | "Open Wail once with internet so it can work offline later." |

## Accessibility

- Every sound event also appears as text, and arrivals vibrate where supported.
- Calm mode removes scanlines, glow and flicker; respects `prefers-reduced-motion` by default.
- All controls reachable by keyboard; visible focus ring in `--ember`.
- Buttons at least 48 × 48 px.

## Copy voice

Spooky in labels, plain in instructions. Example: the button says "Wail it", the helper text says "Hold the phones about 1 metre apart."
