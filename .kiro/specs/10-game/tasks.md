---
spec: 10-game
title: Game rules engine
status: draft
owner: Kiro
---

# 10 · Game rules engine (tasks)

## Overview

Tasks are small, independent, and each produces one file or one test. Complete them in order. Each builds on the previous layer.

## Layer 1: Types

- [x] 1. Create `src/game/types.ts` with types
  - Export `type Role = 'Living' | 'Possessed'`
  - Export `type Clue = { kind: 'not-possessed'; candle: number } | { kind: 'one-of-possessed'; a: number; b: number }`
  - Export `type RNG = () => number`
  - Export `type GameState = { readonly roles: readonly Role[]; readonly banished: ReadonlySet<number>; readonly playerCount: number }`
  - Export `type GameError = { ok: false; error: string }`
  - Export `type RoleResult = { ok: true; state: GameState } | GameError`
  - Export `type OmenResult = ReadonlyMap<number, Clue>`
  - Export `type BanishResult = { ok: true; role: Role; state: GameState } | GameError`
  - Add JSDoc comments for each type explaining purpose and constraints.
  - _Requirements: TypeScript strict mode, no dependencies._

## Layer 2: Core logic

- [x] 2. Implement `assignRoles(playerCount, rng)` in `src/game/rules.ts`
  - Validate `playerCount` is 4–8; return `{ ok: false, error: 'bad-player-count' }` if not.
  - Determine Possessed count: 1 for 4–5, 2 for 6–8.
  - Create role array and shuffle with Fisher-Yates using `rng`.
  - Return `{ ok: true, state: { roles, banished: new Set(), playerCount } }`.
  - JSDoc with examples.
  - _Requirements: Pure, immutable, deterministic with injected RNG._

- [x] 3. Implement `makeOmen(state, rng)` in `src/game/rules.ts`
  - For each living candle (not banished), generate one clue.
  - **Living players:** clue is always true.
    - `'not-possessed'` names a Living candle still in the game.
    - `'one-of-possessed'` has at least one Possessed candle still in the game.
  - **Possessed players:** clue may be false (use `rng` to decide).
    - A false `'not-possessed'` clue names a Possessed candle (protects a partner).
  - Never name the receiving candle or any banished candle.
  - In `'one-of-possessed'`, `a` and `b` are always different.
  - Return `ReadonlyMap<number, Clue>` mapping candle index to clue.
  - JSDoc with examples.
  - _Requirements: Pure, immutable, deterministic with injected RNG._

- [x] 4. Implement `banish(state, candle)` in `src/game/rules.ts`
  - Validate `candle` is a valid index (0 to playerCount-1).
  - Check if already banished; return `{ ok: false, error: 'already-banished' }` if so.
  - Return `{ ok: false, error: 'unknown-candle' }` for out-of-range candle.
  - Create new GameState with updated `banished` set.
  - Return `{ ok: true, role: ..., state: ... }` on success.
  - JSDoc with examples.
  - _Requirements: Pure, immutable, no mutations, never throw for bad input._

- [x] 5. Implement `winner(state)` in `src/game/rules.ts`
  - Count living Possessed and living Living players.
  - Return `'living'` if no Possessed remain.
  - Return `'possessed'` if Possessed >= Living (>= covers the equal case).
  - Return `null` otherwise.
  - JSDoc with examples.
  - _Requirements: Pure, deterministic._

## Layer 3: Property tests

- [x] 6. Create `tests/game/R22.roles.prop.test.ts` (test assignRoles)
  - Use `fc.integer({ min: 4, max: 8 })` to generate player counts.
  - Use seeded RNG (write a small seeded generator like mulberry32 inside the test file).
  - Property 1: For each count in 4–8, exactly the right number of Possessed appear.
    - Verify role array length equals playerCount.
    - Verify count of `'Possessed'` is 1 for 4–5, 2 for 6–8.
  - Property 2: Never 0 Possessed; at least one `'Possessed'` in every result.
  - Property 3: All roles are valid; every element is `'Living'` or `'Possessed'`.
  - Property 4: Deterministic; same seed produces same roles twice.
  - _Requirements: Vitest + fast-check, inject deterministic RNG._
  - _numRuns: 200_
  - Run with: `fc.assert(fc.property(...), { numRuns: 200 })`

- [x] 7. Create `tests/game/R23.true-clues.prop.test.ts` (test makeOmen)
  - Generate a GameState with known roles and no banished using generators.
  - Call `makeOmen(state, rng)` with deterministic RNG.
  - Property 1: Every clue to a Living player is true.
    - If clue is `{ kind: 'not-possessed'; candle: X }`, then `state.roles[X]` must be `'Living'`.
    - If clue is `{ kind: 'one-of-possessed'; a: X; b: Y }`, then at least one of `state.roles[X]` or `state.roles[Y]` must be `'Possessed'`.
  - Property 2: Clues have correct structure.
    - Every clue is exactly one of the two Clue shapes; no other shapes.
  - Property 3: Clues never name the receiving candle.
    - For each candle and its clue, the clue does not reference that candle index.
  - Property 4: Clues never mention banished candles.
    - Any candle mentioned in a clue must not be in `state.banished`.
  - _Requirements: Vitest + fast-check, inject deterministic RNG, structural checks on Clue object._
  - _numRuns: 200_
  - Run with: `fc.assert(fc.property(...), { numRuns: 200 })`

- [x] 8. Create `tests/game/R25.game-ends.prop.test.ts` (test winner and game flow)
  - Generate a GameState with known roles using generators.
  - Simulate banishing players in a random order (use `rng` to pick which live candles to banish).
  - Property 1: Any sequence of valid banishments reaches a winner within playerCount steps.
    - After each banishment, check `winner(state)`.
    - Verify that `winner(state)` eventually returns `'living'` or `'possessed'` (not null) within playerCount steps.
  - Property 2: Winner matches the rules.
    - If all Possessed are banished, `winner` returns `'living'`.
    - If Possessed count >= Living count, `winner` returns `'possessed'`.
    - Otherwise, `winner` returns `null`.
  - Property 3: Final state matches the returned winner.
    - If `'living'` was returned, all Possessed must be banished.
    - If `'possessed'` was returned, Possessed must be >= Living.
  - _Requirements: Vitest + fast-check, inject deterministic RNG, simulate realistic game play._
  - _numRuns: 200_
  - Run with: `fc.assert(fc.property(...), { numRuns: 200 })`

## Notes

- Each task produces one file or one test file.
- Tasks build sequentially: types first, then logic, then tests.
- Tests use fast-check's property-based generation to cover a wide range of inputs.
- All code is TypeScript strict, pure, and deterministic (with injected RNG).
- Property tests run with `numRuns: 200` to ensure coverage.
- Use seeded RNG generators inside test files (e.g., mulberry32); there is no shared seededRandom helper.
