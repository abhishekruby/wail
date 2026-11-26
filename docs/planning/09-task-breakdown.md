# 09 · Task breakdown

Stage status: ready (Nov 20, 2026). Estimates are focused hours. Internal submit deadline: **Dec 3, 11:00 PM IST**. Official deadline: Dec 4, 2:00 PM PT = Dec 5, 3:30 AM IST.

## Séance plan (Nov 26): this replaces the schedules below

Approved Nov 26: Wail becomes Séance, a party game played through sound (`11-seance-game-design.md`, PRD v2.0). Engine specs 01, 02 and 03 are built (86 tests). Credits: about 6 left on Kiro Free, 50 more on Dec 1, hackathon code not yet received. All Kiro runs use the CLI with `claude-haiku-4.5` (about 0.5 credits per task, about 4 per spec plan).

| Day | Kiro (product) | Abhishek | Claude Code |
| --- | --- | --- | --- |
| Thu Nov 26 | Prompt 6: spec 10-game plan, then its first pure-rules tasks while credits last | Read the plan | Review every stage, run tests, commit |
| Fri Nov 27 – Mon Nov 30 | Continue only if credits arrive (hackathon code, or Abhishek's own choice of Kiro Pro) | Phone check: does `crypto.subtle` ECDH work on iQOO, Vivo, Samsung (test page from Claude Code) | Field-test pages in `spikes/`: join chirp and 4-phone broadcast; README; Vercel setup |
| Tue Dec 1 | 50 free credits: prompt 7 (key exchange), prompt 8 (broadcast), prompt 9 (UI + Play alone), PWA | First real game with family, 4 phones | Review, deploy, field-test log |
| Wed Dec 2 | Bug fixes only; **feature freeze 12:00 IST** | Record the video in the evening | Write-up, Devpost text |
| Thu Dec 3 | | Social post, submit by 11 PM IST | Check every link in a private window |

**Scope priority if credits run out:**
1. Must: join + possession + reveal (R20–R22, R24, R25), Play alone (R26), hold-to-reveal (R27), live URL, video.
2. Should: omens with clues (R23), haunted visuals (candles, level meter), offline PWA.
3. Could: Kiro Crew app, waterfall spectrogram, sound effects.

The schedules and phases below are kept as history. Where they mention cards, Compose, Crypt, history, relay, groups or call mode, they are superseded.

## Revised schedule (Nov 25): 9 days left, credits not yet received

Status on Nov 25: ID check passed (Devpost page: "allow 3 business days"), no credit code yet; reminder email drafted. Kiro account is on Kiro Free (0 / 50 credits, resets Dec 1); the code goes in **Settings → Account & plan → Promo code**. Kiro IDE not yet installed. Kill test not yet run. Phase 1 is 3 days late.

**The rule that doesn't change:** product code in `src/` is built in Kiro only. If credits run short we cut scope; we don't move product code to Gemini or Claude Code, because that risks disqualification.

| Day | Kiro (product) | Abhishek | Gemini / Antigravity | Claude Code |
| --- | --- | --- | --- | --- |
| Wed Nov 25 | Install IDE, sign in, check steering; spec 02 requirements + design (free credits) | Install Kiro; send credit email; kill test | Assets (Task E), submission drafts (Task F) | Review spec 02 before each approval |
| Thu Nov 26 | Spec 02 tasks; spec 03 crypto | Kill test if not done | Review Kiro's protocol code vs steering | Run tests, review, commit |
| Fri Nov 27 | Spec 01 modem core; hooks; custom agent | Phone test of first send/receive | Second review | Field-log, CI |
| Sat Nov 28 | Specs 04 cards + 08 UI: Séance, Compose, solo demo | Real-device check | Accessibility check of the UI | Review, fix-plans for Kiro |
| Sun Nov 29 | Broadcast carousel (05), history (06) | Broadcast test with 3 phones | | Deploy to Vercel |
| Mon Nov 30 | PWA offline (07), polish; Crew app only if credits came by Nov 27 | | | Offline test, Lighthouse |
| Tue Dec 1 | Bug fixes only | Field tests (matrix in 06) | Fill README results | **Feature freeze** |
| Wed Dec 2 | | Record video, voiceover | Captions, thumbnail | Kiro write-up, edit check |
| Thu Dec 3 | | Social post (own words), submit by 11 PM IST | | Check every link in a private window |

**If the code arrives by Nov 27:** follow the table; add the Crew app (T1.9) and call mode if the kill test passed.

**If no code by Nov 30:** finish only the must-haves below on the free credits (50 now, 50 more on Dec 1). Buying a Kiro Pro plan is Abhishek's own decision; the plan page lists it at $20/month with 500 trial credits on first upgrade.

**Scope priority if credits are short:**
1. Must: broadcast of text + notice card, CRC-checked receive, solo demo, haunted Séance screen, offline PWA, live URL, video.
2. Should: locked messages, location and contact cards, history (Crypt).
3. Could: call mode, Kiro Crew app (`wail-nightwatch`), waterfall spectrogram (fall back to a simple level meter).

## Phase 0 · Nov 21 · Setup and kill test (≈ 5 h)

- [x] T0.1 Register for Kiroween and request Kiro credits (done Nov 20; waiting for the Didit ID-check email)
- [x] T0.2 India eligibility checked against the excluded list (Nov 20)
- [x] T0.3 CI moved to `.github/workflows/ci.yml`; public repo https://github.com/abhishekruby/wail created, first commit pushed, CI green (Nov 20). `wail-nightwatch` repo is created in T1.9.
- [ ] T0.4 `npm install`, `npm run dev`, open on laptop and phone over HTTPS · 0.75 h (install, typecheck and tests done Nov 20; phone open pending)
- [x] T0.4b Offline codec simulation of phone calls (Antigravity, verified by Claude Code re-run): `docs/research/codec-sim.md` (Nov 20)
- [x] T0.4c Judge-style review of the plan (Antigravity): `docs/research/judge-review.md`; accepted changes applied to 01, 02, 04, 06, 07, 09, 10 (Nov 20)
- [ ] T0.5 Kill test page: send 100 bytes 10× each over air (1 m, 3 m), Bluetooth speaker, WhatsApp call, normal call; record results in `docs/field-tests.md` · 2 h. Run the two call rows twice: AUDIBLE_FAST, then DT_FASTEST at volume 50.
- [ ] T0.6 Confirm the 140-byte limit on real devices (already measured in the lab on Nov 20); keep `MAX_FRAME = 128` · 0.5 h
- [ ] T0.7 Decision: is call mode in v1? Apply the rule in 04-prd.md §2 (≥ 7/10 on a call row with DT_FASTEST) and note the result there · 0.25 h

## Phase 1 · Nov 22 to 24 · Modem, protocol, property tests (≈ 14 h)

- [ ] T1.1 In Kiro: create spec 01-modem-core from R2, R10 · 1 h
- [ ] T1.2 In Kiro: create spec 02-packet-protocol from R1, R3, R4, R13 · 1 h
- [ ] T1.3 In Kiro: create spec 03-crypto from R6, R7 · 0.5 h
- [ ] T1.4 Run spec 02 tasks: frame encode/decode, chunking, reassembly, CRC-32, replay guard · 4 h
- [ ] T1.5 Run spec 03 tasks: lock/unlock with Web Crypto · 2 h
- [ ] T1.6 Run spec 01 tasks: `GgwaveModem`, `PassthroughModem`, mic worklet, playback · 3.5 h
- [ ] T1.7 Property tests P1 to P6 green; Node noise suite with SNR levels · 2 h
- [ ] T1.8 Create the Kiro hooks (see table below) in the Kiro UI · 0.5 h
- [ ] T1.9 Start `wail-nightwatch` early (moved from Phase 4): create the repo, build it in Kiro Crew on the KiroCrew app kit (https://github.com/kirodotdev/KiroCrew), and schedule its first nightly run by Nov 24 so ≥ 5 nightly runs exist before submission · 3 h
- [ ] T1.10 Create one Kiro custom agent, a "protocol auditor" that reviews changes in `src/protocol/` and `src/modem/` against `.kiro/steering/protocol.md` and the CRC rules; record what it caught for the write-up · 1 h
- [ ] T1.11 Try at least one Kiro Power relevant to the stack (testing, accessibility or web performance) and note in `docs/kiro-writeup.md` what it changed · 0.5 h

## Phase 2 · Nov 25 to 27 · Haunted UI and storage (≈ 13 h)

- [ ] T2.1 In Kiro: specs 04-cards, 06-storage, 08-haunted-ui · 1.5 h
- [ ] T2.2 Theme tokens, fonts (self-hosted), calm mode · 1.5 h (first update `.kiro/steering/haunted-ui.md`: `--phosphor-dim` → `#56a86e`; plain-word subtitles under spooky nav labels)
- [ ] T2.3 Séance screen with live waterfall spectrogram and chunk dots · 3 h
- [ ] T2.3b Solo demo "Try it on this device" (R14): built-in sample recording decoded through the real decoder, no mic · 1 h
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

- [ ] T4.1 `wail-nightwatch`: add the codec channels from `docs/research/codec-sim.md` to its nightly run, plus a trend panel across all nights so far · 2 h
- [ ] T4.2 (moved to T1.9)
- [ ] T4.3 Field tests from the matrix in 06-architecture.md (Testing strategy), including the 3-receiver broadcast row · 3 h
- [ ] T4.4 README results table, credits, prior art (Nedagram, Waver, ggwave), setup steps · 1 h
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

About 66 focused hours across 13 days, so roughly 5 h a day plus buffer (Nov 20 revision added T1.9 to T1.11 and T2.3b, and moved Crew work earlier).

## Who does what

| Who | Work |
| --- | --- |
| Kiro | All product code in `src/`, specs, hooks, custom agent, Crew app. This is what judges score. |
| Claude Code (lead) | Planning, reviews of Kiro output, debugging, tests, git, CI, deploy, field-test logging, write-up, prompts for Antigravity |
| Antigravity | Non-product work only: `spikes/`, `docs/research/`, drafts. Never `src/` or `.kiro/` |
| Abhishek | Real-device tests, voiceover, the social post in his own words, final submission |
