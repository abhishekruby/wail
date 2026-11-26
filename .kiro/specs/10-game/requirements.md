---
spec: 10-game
title: Game rules engine
status: draft
owner: Kiro
---

# 10 · Game rules engine (requirements)

## Overview

The game rules engine (`src/game/rules.ts` and `src/game/types.ts`) is a pure TypeScript module that runs the Séance game logic: role assignment, clue generation, player banishment, and win detection. It has no DOM, no Web Crypto, and no audio—just deterministic game state and logic runnable in Node.

Randomness comes from an injected RNG so tests are deterministic and reproducible.

## Functional requirements (source: R22, R23, R24, R25 in docs/planning/04-prd.md and rules in docs/planning/11-seance-game-design.md)

### R22: Assign roles

**Input:** `playerCount` (4–8), `rng` (function)

**Function:** `assignRoles(playerCount, rng)`

**Output:** 
- On success: `{ ok: true; state: GameState }` where the state has every candle in the game.
- On error (player count not 4–8): `{ ok: false; error: 'bad-player-count' }`

**Rule:**
- For 4–5 players: exactly 1 Possessed.
- For 6–8 players: exactly 2 Possessed.
- Never return 0 Possessed players.
- All other players are Living.
- Role assignment is random (uses injected `rng`).
- Candle numbers are 0-based indices everywhere in this module; the UI shows candle + 1.

### R23: Generate omens

**Input:** `state` (game state with current roles and living players), `rng`

**Function:** `makeOmen(state, rng)`

**Output:** A `ReadonlyMap<number, Clue>` mapping candle indices to structured clues.

**Clue type:**
```typescript
type Clue = 
  | { kind: 'not-possessed'; candle: number }
  | { kind: 'one-of-possessed'; a: number; b: number }
```

Only these two clue shapes exist. Clues are encrypted and transmitted in ~3 bytes on air; the UI renders them as words.

**Rule:**
- One clue per player still in the game (not yet banished).
- **For Living players:** the clue is always factually true about the current roles.
  - `'not-possessed'` names a Living candle still in the game.
  - `'one-of-possessed'` names two different candles where at least one is Possessed still in the game.
  - While `winner(state)` is null, both shapes are always possible for a Living receiver because at least one other Living and one Possessed remain.
- **For Possessed players:** the clue uses the same two shapes and may be true or false (decided with `rng`).
  - A false `'not-possessed'` clue names a Possessed candle (it protects a partner).
  - A false `'one-of-possessed'` clue names two candles where both are Living (or other false combinations).
- **Naming rule:** a clue never names the receiving candle (a player never sees their own candle number in their clue).
- **Validity rule:** a clue never names a banished candle.
- In `'one-of-possessed'`, the values `a` and `b` are always different.
- In `'one-of-possessed'`, `a < b` always, so the order never reveals which candle is Possessed.
- Clues are generated from the current game state (which players are still alive).

### R24: Banish a player

**Input:** `state` (game state), `candle` (player index to banish)

**Function:** `banish(state, candle)`

**Output:**
- On success: `{ ok: true; role: Role; state: GameState }` with the role of the banished player and updated state.
- On error: `{ ok: false; error: string }` where error is exactly one of:
  - `'unknown-candle'` (candle index out of range)
  - `'already-banished'` (candle was already banished)

**Rule:**
- A banished player cannot be banished twice.
- Banishing an already-banished player or an unknown candle returns a tagged error.
- State must not be mutated; return a new state.
- Never throw for bad input.

### R25: Check for a winner

**Input:** `state` (game state after one or more banishments)

**Function:** `winner(state)`

**Output:** One of `'living'`, `'possessed'`, or `null`.

**Rule:**
- **Living wins** (`'living'`): every Possessed player is banished.
- **Possessed wins** (`'possessed'`): the number of Possessed players still in the game is greater than or equal to the number of Living players still in the game. The >= covers the equal case in the PRD.
- **Game continues** (`null`): neither condition is met.

## Property-based requirements

| ID | Property | Test file |
| --- | --- | --- |
| G1 | For every player count 4–8: exactly the right number of Possessed, never 0, all roles valid, same seed produces same shuffle | `tests/game/R22.roles.prop.test.ts` |
| G2 | For any game state: every clue given to a Living player is true; clues have correct Clue structure and never mention receiving or banished candles | `tests/game/R23.true-clues.prop.test.ts` |
| G4 | For any sequence of valid banishments: the game ends within playerCount steps, and the winner matches the rules | `tests/game/R25.game-ends.prop.test.ts` |

Property tests run with `numRuns: 200` or more to ensure high coverage.

## Constraints

- **Pure module:** no imports from DOM, Web Audio, IndexedDB, or Web Crypto. Must run in Node.
- **Deterministic with injected RNG:** the `rng` function is `() => number` (returns 0–1 like `Math.random()`). Same seed = same game.
- **Immutable state:** all functions return new state objects; never mutate inputs.
- **Error handling:** validation errors (bad player count, unknown candle, already banished) return `{ ok: false, error: string }`. Never throw for bad input.
- **Candle indexing:** candle numbers are 0-based indices everywhere in this module; the UI shows candle + 1.
- **TypeScript strict mode:** no `any` without explanation.

## Out of scope

- Key exchange and encryption (spec 03).
- UI rendering (spec 08).
- Audio modem and codec (specs 01, 02).
- Late-joiner broadcasts (spec 05).
- Solo demo bot logic (spec 08).
