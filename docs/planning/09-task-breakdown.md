# 09 · Task breakdown

Stage status: ready (Nov 20, 2026). Estimates are focused hours. Internal submit deadline: **Dec 3, 11:00 PM IST**. Official deadline: Dec 4, 2:00 PM PT = Dec 5, 3:30 AM IST.

## Phase 0 · Nov 21 · Setup and kill test (≈ 5 h)

- [x] T0.1 Register for Kiroween and request Kiro credits (done Nov 20; waiting for the Didit ID-check email)
- [x] T0.2 India eligibility checked against the excluded list (Nov 20)
- [ ] T0.3 Move `docs/setup/ci.yml` to `.github/workflows/ci.yml`, create GitHub repos `wail` and `wail-nightwatch`, make the first commit and push · 0.5 h
- [ ] T0.4 `npm install`, `npm run dev`, open on laptop and phone over HTTPS · 0.75 h
- [ ] T0.5 Kill test page: ggwave hello world, send 100 bytes 10× each over air (1 m, 3 m), Bluetooth speaker, WhatsApp call, normal call; record results in `docs/field-tests.md` · 2 h
- [ ] T0.6 Confirm the 140-byte limit on real devices (already measured in the lab on Nov 20); keep `MAX_FRAME = 128` · 0.5 h
- [ ] T0.7 Decision: is phone-call transfer in or out of scope? Note it in 04-prd.md · 0.25 h

## Phase 1 · Nov 22 to 24 · Modem, protocol, property tests (≈ 14 h)

- [ ] T1.1 In Kiro: create spec 01-modem-core from R2, R10 · 1 h
- [ ] T1.2 In Kiro: create spec 02-packet-protocol from R1, R3, R4, R13 · 1 h
- [ ] T1.3 In Kiro: create spec 03-crypto from R6, R7 · 0.5 h
- [ ] T1.4 Run spec 02 tasks: frame encode/decode, chunking, reassembly, CRC-32, replay guard · 4 h
- [ ] T1.5 Run spec 03 tasks: lock/unlock with Web Crypto · 2 h
- [ ] T1.6 Run spec 01 tasks: `GgwaveModem`, `PassthroughModem`, mic worklet, playback · 3.5 h
- [ ] T1.7 Property tests P1 to P6 green; Node noise suite with SNR levels · 2 h
- [ ] T1.8 Create the Kiro hooks (see table below) in the Kiro UI · 0.5 h

## Phase 2 · Nov 25 to 27 · Haunted UI and storage (≈ 13 h)

- [ ] T2.1 In Kiro: specs 04-cards, 06-storage, 08-haunted-ui · 1.5 h
- [ ] T2.2 Theme tokens, fonts (self-hosted), calm mode · 1.5 h
- [ ] T2.3 Séance screen with live spectrogram and chunk dots · 3 h
- [ ] T2.4 Compose screen with byte counter, card picker, toggles · 2.5 h
- [ ] T2.5 Crypt and Altar screens, self-test · 2 h
- [ ] T2.6 IndexedDB stores and history · 1.5 h
- [ ] T2.7 Playwright fake-mic end-to-end test in CI · 1 h

## Phase 3 · Nov 28 to 29 · Broadcast, lock, offline (≈ 9 h)

- [ ] T3.1 In Kiro: specs 05-broadcast, 07-pwa-offline · 1 h
- [ ] T3.2 Broadcast carousel (3 cycles) · 2 h
- [ ] T3.3 Lock flow end to end in the UI · 1.5 h
- [ ] T3.4 PWA: manifest, icons, precache, offline reload test · 2 h
- [ ] T3.5 CSP header, Vercel deploy, HTTPS check on phone · 1.5 h
- [ ] T3.6 Accessibility pass: contrast, focus, reduced motion · 1 h

## Phase 4 · Nov 30 to Dec 1 · Crew app and field tests (≈ 10 h)

- [ ] T4.1 `wail-nightwatch`: Python noise generator + decoder + JSON report · 3 h
- [ ] T4.2 Package as a Kiro Crew app with a small report panel; schedule nightly · 2 h
- [ ] T4.3 Field tests from the matrix in 06-architecture.md (Testing strategy) · 3 h
- [ ] T4.4 README results table, credits, setup steps · 1 h
- [ ] T4.5 Freeze checklist (04-prd.md §7) all ticked → **feature freeze** · 1 h

## Phase 5 · Dec 2 to 3 · Submission (≈ 10 h)

- [ ] T5.1 Record demo video (script in 10-submission-plan.md), edit to 2:50, upload public · 4 h
- [ ] T5.2 Kiro write-up (`docs/kiro-writeup.md`) · 2 h
- [ ] T5.3 Devpost text, screenshots, category + bonus boxes · 1.5 h
- [ ] T5.4 dev.to blog post ("written for the Kiroween 2026 hackathon") · 1.5 h
- [ ] T5.5 Social post starting with #KiroweenHackathon26 · 0.25 h
- [ ] T5.6 Submit on Devpost; check every link in a private window · 0.75 h

## Kiro hooks to create in T1.8

| Hook | Trigger | Action |
| --- | --- | --- |
| Protocol tests on save | File saved in `src/protocol/` | Run `npx vitest run tests/property` |
| Audio rule check | File saved in `src/audio/` or `src/modem/` | Agent checks the change against `.kiro/steering/audio-dsp.md` |
| Write-up sync | File saved in `.kiro/specs/` | Agent appends what changed to `docs/kiro-writeup.md` |
| Full gate | Agent stops | Run `npm test`; report failures |

Create these in the Kiro UI so the JSON format matches your Kiro version. They then live in `.kiro/hooks/`.

## Totals

About 61 focused hours across 13 days, so roughly 4.5 h a day plus buffer.
