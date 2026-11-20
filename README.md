# Wail

**Broadcast a short message to every device in the room, as sound. No internet, no SIM data, no pairing.**

When mobile data is cut, one phone on a loudspeaker plays the message as tones and every device in earshot with Wail open decodes it. The message repeats, so anyone who starts listening late still gets all of it. Built for relief teams, clinics and organisers during internet shutdowns and disasters. Open it once online; after that it works offline.

> The dial-up modem died in the 2000s. We dug it up, because when the internet is switched off, sound still travels.

Entry for **Kiroween 2026**, category **Resurrection**.

## Status

Planning complete (Nov 20, 2026), revised after an outside review and a codec simulation. Development starts with the Phase 0 kill test. See [docs/planning/](docs/planning/00-README.md).

## Run it

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:5173
npm run dev:phone  # HTTPS on your LAN, so a phone can use the mic
npm test           # unit + property tests
```

Kill test: open `/spikes/kill-test.html` on two devices, press Listen on one and Send on the other, and log the results in [docs/field-tests.md](docs/field-tests.md).

## How it works

Message → serialise → compress → (optional lock with AES-GCM) → split into frames of 12 to 128 bytes, each whitened with a per-repeat salt and sealed with a CRC-16 → ggwave turns each frame into tones → speaker → air → microphone → ggwave → reassemble → CRC-32 check → shown only if exact. Details: [docs/planning/06-architecture.md](docs/planning/06-architecture.md).

## Measured so far

Lab baseline (Nov 20): ggwave carries up to 140 bytes per transmission, is binary-safe, decoded 64-byte frames 10/10 down to −5 dB SNR of white noise, and was caught returning wrong bytes with no error for short or low-entropy payloads. Wail's whitening and per-frame CRC exist because of that finding.

Codec simulation (Nov 20): ggwave's default audible modes pass VoLTE (AMR-WB) and WhatsApp-style Opus 10/10 but fail old narrowband calls (AMR-NB) 0/10; its low-frequency mode at higher volume passes all of them 10/10 in the lab. Real calls are tested next. See [docs/research/codec-sim.md](docs/research/codec-sim.md).

Field results will be added as they are measured. See [docs/field-tests.md](docs/field-tests.md).

## Prior art, and how Wail differs

Sending data as sound is not new, and we build on that work:

- [ggwave](https://github.com/ggerganov/ggwave) and its app Waver: the modem library Wail uses.
- [Nedagram](https://github.com/shayanb/Nedagram): an offline PWA that sends text over sound or a phone call from one person to another, with encryption and error correction, aimed at sharing configs, passwords and keys.
- Chirp (acquired by Sonos in 2020, SDK withdrawn), Quiet.js, Fldigi/AndFlmsg for radio operators.

Wail's focus is different: **one sender to a whole room**, a repeating broadcast that late listeners can still complete, structured crisis cards for non-technical people, and reliability numbers published per channel.

## Built with Kiro

Specs, steering, hooks and MCP settings live in [`.kiro/`](.kiro/). The write-up is in [docs/kiro-writeup.md](docs/kiro-writeup.md).

## Credits and disclosure

- Data-over-sound modem: [ggwave](https://github.com/ggerganov/ggwave) by Georgi Gerganov (MIT).
- `spikes/` holds throwaway test code written during planning. It is not part of the product.
- Planning docs, steering drafts, `spikes/` and `docs/research/` were prepared before Kiro credits arrived, with help from Claude and Gemini (Antigravity). Product code in `src/` is built with Kiro; see [docs/kiro-writeup.md](docs/kiro-writeup.md).

## Licence

MIT. See [LICENSE](LICENSE).
