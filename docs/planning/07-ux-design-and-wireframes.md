# 07 · UI/UX design and wireframes

Stage status: done (Nov 20, 2026). Low-fidelity wireframes: open `wireframes.html` in this folder in any browser.

## Design direction: "a 1990s modem terminal at midnight"

The Halloween theme is built into what the app does: the scream of the modem *is* the message, and the spectrogram is where the ghost appears. The effects never cost readability.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0b0f0c` | Near-black background |
| `--phosphor` | `#7CFF9E` | Primary text and the signal trace |
| `--phosphor-dim` | `#3f7f52` | Secondary text, borders |
| `--ember` | `#FFB347` | Warnings, "locked", "unverified sender" |
| `--blood` | `#FF5C5C` | Errors only |
| Font, UI | `"IBM Plex Mono", ui-monospace, monospace` (self-hosted, offline) | Everything |
| Body size | 16 px minimum; message text 18 px | Readability |
| Radius | 8 px | Buttons, cards |
| Effects | CRT scanlines at 6% opacity, slight glow on the trace | Off in calm mode |

Contrast: phosphor on `--bg` is far above the WCAG AA 4.5:1 minimum (check every pair with a contrast tool during build).

## Screens

| Screen | Purpose | Main elements |
| --- | --- | --- |
| **Séance** (home) | Listen and send from one place | Big "Listen" and "Wail" buttons, live spectrogram, signal meter, last 5 messages |
| **Compose** | Write a message or a card | Text box with byte counter and air-time estimate, card picker, Lock toggle + passphrase, Broadcast toggle, "Wail it" button |
| **Crypt** (history) | Past messages | Newest first, direction icon, time, status chip (received, locked, sent), tap to open |
| **Altar** (settings) | Tune and test | Volume, speed (normal/fast), calm mode, self-test, clear history, about + credits (ggwave) |

## Key flows

**Send:** Séance → Wail → type → Wail it → handshake sound → frames play → "Sent (3 cycles)".

**Receive:** Séance → Listen → allow mic once → spectrogram rises → chunk dots fill → checksum OK → vibrate + message rises out of the static.

**Broadcast:** Compose → Broadcast on → Wail it → repeats 3 times → "Anyone in earshot has it".

**Locked:** both agree a passphrase out loud → sender locks → receiver enters it in Listen → text shows. Wrong or no passphrase → "Locked message from the other side".

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
