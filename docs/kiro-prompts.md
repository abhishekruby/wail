# Kiro prompts, Phase 1 (ready for when credits arrive)

Paste these into Kiro, one at a time, in order. They point Kiro at the PRD and steering instead of restating them, so the specs stay consistent with the plan. Keep this file: the write-up can quote it to show how the specs were driven.

## Before the first prompt (10 min)

1. Open `~/Documents/personal-project/wail` in the Kiro IDE and sign in.
2. Kiro panel → **Steering**: you should see 6 files (product, tech, structure, protocol, audio-dsp, haunted-ui). If any is missing, stop and tell Claude Code.
3. Kiro panel → **MCP**: Context7 and Playwright should show as connected.
4. Note the credits shown in your Kiro account. After prompt 1, note them again so we know the cost of one spec.

**Credit rules:** 4,000 credits for the whole build. Use Spec mode for features, run tasks one at a time (not "run all"), and don't ask Kiro to re-generate a whole spec to fix one line; edit the line and ask Kiro to update the rest.

**After each stage** (requirements, design, tasks), tell Claude Code "review spec 02" before you approve it. Claude Code reads `.kiro/specs/` and checks it against the PRD, the steering and the lab findings.

## Prompt 1 · Spec `02-packet-protocol` (start here: pure code, best for property tests)

Mode: **Spec**.

```
Create a spec named 02-packet-protocol for Wail.

Source of truth: requirements R1, R3, R4 and R13 in docs/planning/04-prd.md, the frame format and invariants in .kiro/steering/protocol.md, and property tests P1 to P4 and P10 in docs/planning/06-architecture.md (Testing strategy).

Scope: src/protocol/ only. It must stay pure TypeScript (no DOM, Web Audio or IndexedDB), runnable in Node. Frame constants only in src/protocol/constants.ts. Include: frame encode/decode with salt + whitening + CRC-16/CCITT-FALSE, splitting a payload into a manifest frame and data frames, order-independent reassembly that ignores duplicates, the message CRC-32 check, and the 10-minute replay guard for message_id.

Use the reference whitening in tests/ggwave-baseline.test.ts. Every requirement needs at least one fast-check property test at tests/protocol/<REQ-ID>.<short-name>.prop.test.ts with at least 1,000 runs. Tests use a PassthroughModem, never real audio.

Do not touch src/ui, src/audio or src/modem in this spec.
```

What Claude Code will check: frame ≤ 128 and ≥ 12 bytes, a new salt per repeat, CRC-16 failure drops the frame, "incomplete" never returns bytes, constants in one file, no browser imports.

## Prompt 2 · Spec `03-crypto`

Mode: **Spec**.

```
Create a spec named 03-crypto for Wail.

Source of truth: R6 and R7 in docs/planning/04-prd.md (R7 includes keeping a locked payload so it can be unlocked later), the Security table and property P5 in docs/planning/06-architecture.md, and the manifest fields salt (16) and iv (12) in .kiro/steering/protocol.md.

Scope: src/pipeline/ lock and unlock only, pure and runnable in Node 22 (Web Crypto via globalThis.crypto.subtle). PBKDF2-SHA-256 with 310,000 iterations and a 16-byte random salt per message, AES-GCM-256 with a 12-byte IV. The passphrase is never stored. A wrong passphrase must fail cleanly and never return bytes.

Property test P5 at tests/pipeline/R6.lock-roundtrip.prop.test.ts; keep the iteration count configurable for tests only so the suite stays fast, and add one test that runs the real 310,000.
```

## Prompt 3 · Spec `01-modem-core`

Mode: **Spec**.

```
Create a spec named 01-modem-core for Wail.

Source of truth: R2 and R10 in docs/planning/04-prd.md, the Modem interface in docs/planning/06-architecture.md ("The seam between our code and ggwave"), .kiro/steering/audio-dsp.md and the ggwave facts in .kiro/steering/tech.md. Lab results to respect: docs/field-tests.md and docs/research/carousel-sim.md (300 ms gap between frames; FASTEST is not used for room broadcast).

Scope: src/modem/ (Modem interface, GgwaveModem, PassthroughModem) and src/audio/ (mic AudioWorklet posting Float32 blocks, buffer playback, analyser for the spectrogram). GgwaveModem must copy every ggwave output out of WASM memory, never pass more than MAX_FRAME bytes, and read the AudioContext sample rate. Mic constraints: echoCancellation, noiseSuppression and autoGainControl all false; stop every track when leaving Listen.

Leave a clean place for call mode (protocol and volume chosen by a setting), but do not build call mode yet; it depends on the Nov 21 kill test.

Tests: GgwaveModem round-trip in Node for 12 to 128 random bytes at NORMAL and FAST, and a noise test at fixed SNR levels that records the success rate.
```

## Prompt 4 · Hooks (Kiro UI → Agent Hooks → new hook, describe in plain words)

Create each one from the hook panel so the JSON matches your Kiro version:

1. "When a file in src/protocol/ or src/pipeline/ is saved, run `npx vitest run tests/protocol tests/pipeline` and report failures."
2. "When a file in src/audio/ or src/modem/ is saved, check the change against .kiro/steering/audio-dsp.md and tell me about any rule it breaks."
3. "When a file in .kiro/specs/ is saved, add one line to docs/kiro-writeup.md saying which spec changed and what changed."
4. "When the agent finishes a task, run `npm test` and `npm run typecheck` and report the result."

## Prompt 5 · Custom agent "protocol auditor" (T1.10)

```
Create a custom agent named protocol-auditor. Its job: review any change to src/protocol/ or src/modem/ against .kiro/steering/protocol.md and .kiro/steering/tech.md. It must check: no frame over 128 or under 12 bytes; every ggwave output copied and checked with CRC-16 then CRC-32 before use; a new salt per repeat; constants only in src/protocol/constants.ts; no browser APIs in src/protocol/. It reports findings as a short list with file and line, and never edits code itself.
```

Every time the auditor catches something, write one line in `docs/kiro-writeup.md` ("Custom agent" section): what it caught and in which file. Those lines are the evidence judges look for.
