# CLAUDE.md · Wail

Context for Claude Code. Read this first, then `docs/planning/00-README.md`.

## What this is

Wail: Séance, a Halloween party game where a host's speaker ("the ghost") sends secret roles and clues to every phone in the room as sound (ggwave), with no internet. Design: `docs/planning/11-seance-game-design.md`. Entry for Kiroween 2026, category Resurrection. Deadline we work to: Dec 3, 2026, 11:00 PM IST.

## Your role here: helper, not builder

The hackathon requires the product to be built with **Kiro**, and judges score how deeply Kiro was used. Insufficient Kiro use can disqualify the entry. So:

- **Product features** (`src/` except `src/main.tsx` placeholder) are built through Kiro specs in the Kiro IDE. Do not implement spec features here unless Abhishek explicitly asks, and if he does, log it in `docs/kiro-writeup.md` as built outside Kiro.
- **You can freely help with:** setup, running commands, the kill test and other `spikes/`, debugging, reviewing Kiro's output, git, CI, deployment, test recordings, README and docs.
- Never edit `.kiro/specs/` by hand; Kiro owns them. Steering files in `.kiro/steering/` may be edited when Abhishek asks.

## Rules (full list: docs/planning/08-project-rules.md)

- TypeScript strict. `src/protocol/` and `src/pipeline/` stay pure (run in Node).
- Protocol facts are in `.kiro/steering/protocol.md`. Never pass ggwave more than 128 bytes; never trust its output without the frame CRC-16 and message CRC-32.
- `npm test` must pass before any commit. Never weaken a test to make it pass.
- Commits: `type(scope): what`. Never commit `.env` or tokens.
- Ask before deleting files or rewriting git history.

## Commands

```bash
npm install
npm test            # vitest + fast-check
npm run typecheck
npm run dev         # http://localhost:5173
npm run dev:phone   # HTTPS on LAN for phone mic access
npm run build
```

## Current phase

Séance plan in `docs/planning/09-task-breakdown.md` (top section). Engine specs 01–03 are built. Next Kiro prompts: 6 to 10 in `docs/kiro-prompts.md`.
