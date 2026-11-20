---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**"]
---

# Haunted modem UI

Look: a 1990s modem terminal at midnight. Effects never cost readability.

| Token | Value |
| --- | --- |
| --bg | #0b0f0c |
| --phosphor | #7CFF9E |
| --phosphor-dim | #3f7f52 |
| --ember | #FFB347 (locked, unverified, focus ring) |
| --blood | #FF5C5C (errors only) |
| font | "IBM Plex Mono", self-hosted (works offline) |

- Body text 16 px minimum, message text 18 px. WCAG AA contrast on every pair.
- Buttons at least 48 × 48 px. Visible focus ring.
- Scanlines (6% opacity) and glow are off in calm mode and when `prefers-reduced-motion` is set.
- Every sound event also shows as text; arrivals vibrate where supported.
- Labels can be spooky ("Wail it", "Crypt"), instructions stay plain ("Hold the phones about 1 metre apart").
- Wireframes: `docs/planning/wireframes.html`. Spec: `docs/planning/07-ux-design-and-wireframes.md`.
