# Wail Brand & Social Assets

Hand-coded vector SVG assets and locally rasterized PNG exports matching Wail's **"1990s modem terminal at midnight"** design system (`docs/planning/07-ux-design-and-wireframes.md`). Zero external images, embedded web fonts, or third-party graphics are used.

## Asset Inventory

| File | Dimensions | File Size | Purpose & Notes |
| --- | --- | --- | --- |
| `icon.svg` | `512 × 512` | `3,112 B` | Primary app icon. Spectrogram-banded phosphor ghost with `W`-wave acoustic hem and broadcast wavefronts; all foreground geometry sits within `r ≤ 188 px` of `(256, 256)` (inside the `r = 204.8 px` central 80% maskable PWA circle) on full-bleed `#0b0f0c`. |
| `favicon.svg` | `32 × 32` | `945 B` | Simplified flat vector icon tuned for `16–32 px` browser tabs (no fine scanline slits or blur filters). |
| `og-card.svg` | `1200 × 630` | `6,699 B` | Open Graph / social share card featuring the icon, `WAIL` wordmark, tagline, and stepped FSK spectrogram strip using system `ui-monospace` / `monospace` stacks. |
| `devpost-cover.svg` | `1500 × 1000` (`3:2`) | `8,303 B` | Devpost cover image combining the hero lockup with a 3-panel sender → FSK spectrogram → room-broadcast diagram. |
| `icon-192.png` | `192 × 192` | `19,531 B` | Maskable PWA icon PNG rasterized from `icon.svg`. |
| `icon-512.png` | `512 × 512` | `86,704 B` | High-res PWA icon PNG rasterized from `icon.svg`. |
| `og-card.png` | `1200 × 630` | `76,491 B` | Social share card PNG rasterized from `og-card.svg`. |
| `devpost-cover.png` | `1500 × 1000` (`3:2`) | `175,227 B` | Devpost cover PNG rasterized from `devpost-cover.svg`. |

## Exact Colours Used

| Token / Role | Hex | Where Used |
| --- | --- | --- |
| `--bg` | `#0b0f0c` | Full-bleed terminal background, panel fills, ghost eye/mouth cutouts |
| `--phosphor` | `#7CFF9E` | Primary wordmark (`WAIL`), ghost body, inner broadcast waves, active FSK tone blocks, verified status labels |
| `--phosphor-dim` | `#56a86e` | Terminal borders, outer broadcast waves, secondary metadata captions, secondary FSK tone blocks |
| Body ink | `#d9ffe4` | Primary pitch copy (`Broadcast a message to every phone in the room.`), card quote previews, ghost crest highlight |
| `--ember` | `#FFB347` | Frequency-band brackets (`1.9-6.3 kHz`), status-bar mode tags (`OFFLINE · 48 kHz FSK`, `KIROWEEN 2026 · RESURRECTION`), sender step header |

## WCAG 2.1 Text Contrast Ratios

All text in `og-card.svg` and `devpost-cover.svg` sits directly over `#0b0f0c` (with a subtle 5% `#7CFF9E` CRT scanline overlay peaking at `#111b13` on scanline rows). Every text colour exceeds the **4.5:1** WCAG 2.1 AA minimum on both pure `#0b0f0c` and the 5% scanline rows:

| Text Colour | On `#0b0f0c` | On 5% Scanline (`#111b13`) | WCAG 2.1 Normal Text |
| --- | --- | --- | --- |
| `#d9ffe4` (body ink) | **17.81 : 1** | **16.28 : 1** | Pass (AAA) |
| `#7CFF9E` (`--phosphor`) | **15.31 : 1** | **14.00 : 1** | Pass (AAA) |
| `#FFB347` (`--ember`) | **10.84 : 1** | **9.91 : 1** | Pass (AAA) |
| `#56a86e` (`--phosphor-dim`) | **6.64 : 1** | **6.07 : 1** | Pass (AA) |

## Re-generating PNGs Locally

PNGs were rendered locally using `ffmpeg`'s built-in `librsvg` rasterizer (no packages installed):

```bash
ffmpeg -y -v error -c:v librsvg -width 192  -height 192  -i docs/assets/icon.svg          docs/assets/icon-192.png
ffmpeg -y -v error -c:v librsvg -width 512  -height 512  -i docs/assets/icon.svg          docs/assets/icon-512.png
ffmpeg -y -v error -c:v librsvg -width 1200 -height 630  -i docs/assets/og-card.svg       docs/assets/og-card.png
ffmpeg -y -v error -c:v librsvg -width 1500 -height 1000 -i docs/assets/devpost-cover.svg docs/assets/devpost-cover.png
```
