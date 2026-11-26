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

# Kiro prompts, Séance (added Nov 26)

Wail is now Séance, a party game played through sound (`docs/planning/11-seance-game-design.md`, PRD v2.0). Run these in order, one task at a time, and review each stage with Claude Code before approving. CLI form: `kiro-cli chat --no-interactive --model claude-haiku-4.5 --mode spec --trust-tools=fs_read,fs_write "<prompt>"`.

Rules to keep in every task prompt: `a[i]!` for in-range reads; `fc.assert(fc.property(...), { numRuns })` with options as the second argument of `fc.assert`; `fc.asyncProperty` with `await` for async; import from the file that defines a symbol; `export type` for types; no scratch files; don't run commands; read files back after writing.

## Prompt 6 · Steering update + spec `10-game` (pure rules)

Mode: **Spec**.

```
First, update .kiro/steering/product.md so it describes Wail: Séance, the party game in docs/planning/11-seance-game-design.md and docs/planning/04-prd.md (v2.0). Keep it short: one-line pitch, users (party players 4-8 plus a host; judges on one laptop), what matters most (secret roles stay secret, zero setup, fun in 10 seconds, never show a wrong role, accessibility and calm mode), scope v1 = R20-R27 plus the engine.

Then create a spec named 10-game for Wail.

Source of truth: R22, R23, R24 and R25 in docs/planning/04-prd.md and the game rules in docs/planning/11-seance-game-design.md.

Scope: src/game/rules.ts and src/game/types.ts only. Pure TypeScript, no DOM, no Web Crypto, no audio; runnable in Node. Randomness comes from an injected rng so tests are deterministic.

Include:
1. assignRoles(playerCount, rng): playerCount 4-8, returns a role per candle (index 0..n-1): 1 Possessed for 4-5 players, 2 for 6-8, the rest Living. Any other count returns { ok: false, error: 'bad-player-count' }.
2. makeOmen(state, rng): for every candle still in the game, one short clue. A Living player's clue is always true, a Possessed player's clue is believable and may be false. Clue shapes: "Candle X is not possessed" or "One of candles X, Y is possessed". A clue never names the receiving player.
3. banish(state, candle): marks the candle banished and returns its role; banishing an already banished or unknown candle returns an error and changes nothing.
4. winner(state): 'living' when every Possessed is banished, 'possessed' when the Possessed still in the game are as many as the Living still in the game, else null.

Property tests (numRuns 200 or more) in tests/game/: G1 tests/game/R22.roles.prop.test.ts (right count of Possessed for every count 4-8, never 0); G2 tests/game/R23.true-clues.prop.test.ts (every clue to a Living player is true for the actual roles); G4 tests/game/R25.game-ends.prop.test.ts (any sequence of valid banishments reaches a winner within playerCount steps, and the winner matches the rules).

Do not touch src/protocol, src/pipeline, src/modem or src/audio.
```

## Prompt 7 · Update spec `03-crypto`: key exchange for players

Mode: **Spec** (update the existing spec).

```
Update the existing spec 03-crypto for requirements R21 and R22 in docs/planning/04-prd.md and the "Game messages" section (Keys) in docs/planning/06-architecture.md.

Add src/pipeline/keyx.ts, pure Web Crypto (globalThis.crypto.subtle), runnable in Node 22:
1. createKeyPair(): a fresh ECDH P-256 key pair; the private key is non-extractable.
2. exportPublicKey(pair): the raw public key, 65 bytes. importPublicKey(bytes): returns { ok: false, error: 'bad-public-key' } for anything that is not a valid 65-byte P-256 point, never throws.
3. fingerprint(publicKeyBytes): the first 4 bytes of SHA-256 of the raw key.
4. deriveSharedKey(myPrivate, theirPublic, gameId): ECDH, then HKDF-SHA-256 with gameId as salt and the text "wail-seance" as info, giving a non-extractable AES-GCM-256 key.
5. seal(key, iv12, plaintext) and open(key, iv12, sealed): AES-GCM with a 16-byte tag; open never throws and returns { ok: false, error: 'wrong-key' } on any failure.
6. ivFor(messageType, round, candle): a deterministic 12-byte IV built from those three numbers, so no IV is ever sent on the air and none repeats under one key within a game.

Property test G3 at tests/pipeline/R22.keyx.prop.test.ts (fc.asyncProperty, numRuns 50): for 2-8 players with fresh key pairs, the host and each player derive the same key; each player opens its own sealed role and gets { ok: false } for every other player's entry. A test that importPublicKey rejects random 65-byte arrays that are not on the curve.

Do not change lock/unlock or any existing test.
```

## Prompt 8 · Update spec `10-game`: game messages

Mode: **Spec** (update the existing spec).

```
Update the existing spec 10-game with requirements R20 and R21 in docs/planning/04-prd.md and the "Game messages" table in docs/planning/06-architecture.md.

Add src/game/messages.ts: encode and decode for the five message types join, possession, omen, reveal and end, exactly as in the table (first payload byte = type). Possession and omen entries are sealed per player with src/pipeline/keyx.ts (seal, ivFor) and found by fingerprint. Decoding never throws: anything malformed returns { ok: false, error }. A phone's candle number is the index of its fingerprint in the possession message.

Also add host and player state machines in src/game/session.ts that use rules.ts and messages.ts: the host collects joins (max 8, ignores a repeated public key), builds possession, omen, reveal and end; the player creates its key pair, builds its join, and reads only its own entries.

Property tests (fc.asyncProperty, numRuns 50): for any 4-8 players, every message type round-trips through encode then decode; a player session given the host's possession message shows exactly the role assigned to its candle; a corrupted entry gives { ok: false } and never a different role.
```

## Prompt 9 · Spec `05-broadcast`

Mode: **Spec**.

```
Create a spec named 05-broadcast for Wail.

Source of truth: R5 in docs/planning/04-prd.md, the Broadcast carousel in docs/planning/06-architecture.md and docs/research/carousel-sim.md (300 ms gap, new salt for every repeat with resaltFrame), and docs/field-tests.md (some frames never decode on one salt, so repeats must change the salt).

Scope: src/app/broadcast.ts (pure logic, no DOM). It uses splitPayload and resaltFrame from src/protocol and the Modem interface from src/modem; playback is passed in as an async function so tests run in Node with PassthroughModem. broadcast(payload, options) plays the manifest and data frames for 3 cycles (or until cancelled), a new salt for every repeat, 300 ms gap, and reports progress (cycle, frame) through a callback.

Property test tests/app/R5.carousel.prop.test.ts (numRuns 200): every frame appears in every cycle, salts differ between repeats of the same frame, cancel stops before the next frame.
```

## Prompt 10 · Spec `08-haunted-ui`: host, player, Play alone

Mode: **Spec**.

```
Create a spec named 08-haunted-ui for Wail.

Source of truth: R20, R21, R24-R27 and R10 in docs/planning/04-prd.md, docs/planning/11-seance-game-design.md, docs/planning/07-ux-design-and-wireframes.md and .kiro/steering/haunted-ui.md. First change --phosphor-dim in .kiro/steering/haunted-ui.md to #56a86e (measured contrast fix in 07).

Scope: src/ui/ and src/main.tsx (Preact). Screens:
1. Home: Host a séance, Join a séance, Play alone.
2. Host: Summon (mic on, indicator, candle circle lights on each join), Begin (4-8 players), Omen, tap a candle to Banish, end screen. Uses src/game/session.ts, src/app/broadcast.ts, src/audio and GgwaveModem.
3. Player: Answer (plays the join chirp), then waits listening; shows candle number and spooky name; role and clues only while a finger is held on the screen (R27); vibrates on each new message where supported.
4. Play alone (R26): host plus 3 bot players on one device; the host's waveform goes straight into each bot's GgwaveModem.feed in memory, no microphone; the screen shows the judge's own player view next to the host view.
Calm mode: no flashing or shaking, same information. Every audio error in plain words.

Tests: component tests for hold-to-reveal and calm mode; one Node test that Play alone completes a full game with a fixed rng.
```
