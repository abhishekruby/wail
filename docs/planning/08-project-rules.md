# 08 · Project rules

Stage status: done (Nov 20, 2026). These rules apply to every person and every AI tool working on Wail.

## Rule 1: Kiro builds the product

The hackathon rules say insufficient use of Kiro leads to disqualification, at the judges' discretion, and judges score how deeply Kiro was used. So:

- **Every feature starts as a Kiro spec** (requirements → design → tasks) in the Kiro IDE, and Kiro executes the tasks.
- **Claude Code is a helper, not the builder.** Use it to review, debug, explain, or write throwaway scripts. Any code it writes must go through a Kiro spec task or be clearly logged as vibe-coded in `docs/kiro-writeup.md`.
- Keep evidence as you go: screenshots of spec generation, hook runs and property-test failures for the write-up and video.

## Rule 2: Hackathon compliance

- All code is written from Nov 20, 2026 onward. Disclose any reused code in the README.
- Public GitHub repo, MIT licence visible in About.
- `.kiro/` stays at the repo root and is never in `.gitignore`.
- No third-party music or trademarks in the video. Our handshake sound is synthesised by us.
- Credit ggwave (MIT) in the README and the app's Altar screen.

## Rule 3: Code

- TypeScript strict. No `any` without a comment saying why.
- `src/protocol/` and `src/pipeline/` are pure: no DOM, no Web Audio, no IndexedDB. They must run in Node.
- No audio work on the main thread: mic capture goes through the AudioWorklet.
- Byte order is little-endian everywhere. Frame constants live in one file: `src/protocol/constants.ts`.
- No new dependency without a one-line reason in the PR description. Native APIs first.
- No network calls in app code. CSP enforces it.
- Passphrases never touch storage or logs.

## Rule 4: Tests

- Every EARS requirement has at least one property-based test (fast-check), named after its ID, for example `R3.crc-rejects-corruption.prop.test.ts`.
- `npm test` must be green before any commit to `main`.
- Never weaken a test to make it pass. Fix the code or change the requirement in the spec first.
- Field-test results go in `docs/field-tests.md` with date, devices, distance and tries.

## Rule 5: Git

- Branch per spec: `spec/02-packet-protocol`.
- Commit messages: `type(scope): what` (for example `feat(protocol): reassemble out-of-order frames`).
- Small commits. One spec task per commit where possible.
- Never commit `.env`, keys or tokens.

## Rule 6: Scope

- Feature freeze at the end of Dec 1 (IST). After that, only bug fixes, tests, docs and the video.
- Stretch goals start only after the freeze checklist in 04-prd.md is all ticked.
- If a task takes more than double its estimate, stop and re-plan it in this chat.

## Rule 7: Writing (docs, README, Devpost, blog)

- Plain, specific sentences. Numbers over adjectives.
- No hype words, no stacked dashes, no lists of three for rhythm.
- Every claim about results links to `docs/field-tests.md`.

## Rule 8: Data and privacy

- No analytics, no tracking, no accounts.
- Test recordings in `fixtures/wav/` must not contain anyone's voice.
