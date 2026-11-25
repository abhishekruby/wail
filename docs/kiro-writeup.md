# How Kiro built Wail (write-up draft)

Fill this in as you build. Judges look for each of these. Add screenshots to `docs/img/`.

## Kiro surfaces used and how they differed

- **Kiro IDE:** used to create spec 02 (packet protocol) in Spec mode: requirements → design → tasks, with two review rounds that changed the requirements (late-joiner buffering, CRC-before-whitening order) and the design (`resaltFrame` so every broadcast repeat gets a new salt; reassembler lifecycle after success and CRC failure). Planning one spec cost about 13 credits on the default model.
- **Kiro CLI (3.6.0):** used for everything after that: executing spec tasks (`kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write`) and creating spec 03 in spec mode (`--mode spec`). We picked `claude-haiku-4.5` (0.40× credits) per run with `--model`; a task cost about 0.5 credits and planning spec 03 cost about 4, roughly a third of spec 02 in the IDE. Limiting trusted tools to file read/write meant Kiro never ran shell commands; every change was then type-checked, tested and reviewed before commit. The CLI and IDE share the same account, specs and steering.
- **How they differed:** the IDE is better for the first spec of a project (approval buttons, visible diffs); the CLI made the build loop scriptable and cheap enough to fit inside the free plan while waiting for hackathon credits.
- **Kiro Crew:** (wail-nightwatch, link)

## Spec-driven development vs vibe coding

| Spec | What Kiro generated | What we changed | Vibe-coded parts and why |
| --- | --- | --- | --- |

## Steering docs and what worked

## Agent hooks and what they automated

| Hook | Trigger | What it caught or saved |
| --- | --- | --- |

## Custom agent

## MCP servers and what they enabled

## Property-based testing and what it caught

Before development (Nov 20, planning, fast-check in Vitest): a property test of ggwave itself found that it can return wrong bytes with no error, for example `[0, 80]` decoded as `[0, 0]`, and 33 zero bytes decoded wrong every time at fastest speed. This shaped the protocol: whitening with a per-repeat salt, CRC-16 per frame, 12-byte minimum frame. Details in `docs/field-tests.md`.

During development (Kiro):

| Property | Failure Kiro found | Shrunk input | Fix |
| --- | --- | --- | --- |
| P10 manifest round-trip (`tests/protocol/R8.manifest-round-trip.prop.test.ts`, Nov 25) | `parseManifest` read the 32-bit CRC with `<< 24`, which JavaScript turns into a signed number. About half of all real CRC-32 values have the top bit set, so the receiver would have rejected roughly every second message as corrupt. Failed after 2 runs. | `crc32: 2147483648` (2³¹), shrunk 24 times | `decodeU32LE(...) >>> 0` in `src/protocol/manifest.ts` |

## Kiro powers and third-party tools

## Work done outside Kiro (disclosure)

Before Kiro credits arrived (Nov 20, 2026): planning docs in `docs/planning/`, first drafts of `.kiro/steering/`, the lab baseline test, the kill-test spike, and two research pieces in `docs/research/` (a phone-codec simulation and an outside review of the plan) were prepared with Claude and Gemini (Antigravity). None of it is product code. Everything in `src/` is built through Kiro specs; any exception is listed here.
