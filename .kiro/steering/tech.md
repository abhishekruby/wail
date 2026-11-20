---
inclusion: always
---

# Tech

- TypeScript strict, Vite 8, Preact 11, plain CSS. No UI framework, no CSS framework.
- Modem: `ggwave` 0.4.0 (npm, MIT). Types in `src/ggwave.d.ts`.
- Native APIs first: Web Audio API (AudioWorklet for capture), Web Crypto (PBKDF2-SHA-256 + AES-GCM-256), CompressionStream (deflate-raw), IndexedDB via `idb`.
- Tests: Vitest + fast-check. Every EARS requirement gets at least one property test named after its ID.
- Target browsers: Android Chrome (primary), desktop Chrome, iOS Safari 16.4+ (best effort).
- Hosting: Vercel, static, HTTPS. No backend. No network calls from app code.

## Hard facts about ggwave (measured Nov 20, 2026)

- Max 140 bytes per transmission. Longer input is truncated silently, so never pass more than `MAX_FRAME` (128).
- Pass data as `Uint8Array`; it is binary-safe for 12 to 140 bytes.
- ggwave can decode to WRONG bytes with no error, even on a clean signal: payloads of about 8 bytes or less, and some low-entropy patterns (all zeros at 33, 35, 37… bytes at fastest). NORMAL speed showed no errors in the lab. Never trust ggwave output without whitening + the frame CRC-16 + the message CRC-32 (see protocol.md).
- `encode` and `decode` return views into WASM memory. Copy them (`new Int8Array(view)`) before the next call.
- `decode` takes float32 samples as bytes: `new Int8Array(float32.buffer)`.
- Air time for 64 B: 6.6 s normal, 4.7 s fast, 2.7 s fastest.

## Banned

- `any` without a comment explaining why.
- New dependencies without a one-line reason.
- Audio processing on the main thread in product code.
- Storing passphrases or keys anywhere.
