---
spec: 10-game
title: Game rules engine
status: draft
owner: Kiro
---

# 10 · Game rules engine (design)

## Architecture

The game engine is split into two files:

- **`src/game/types.ts`:** pure data types (GameState, Role, etc.)
- **`src/game/rules.ts`:** pure logic functions (assignRoles, makeOmen, banish, winner)

Both files are deterministic, immutable, and have no external dependencies.

## Data structures

### Role

```typescript
type Role = 'Living' | 'Possessed'
```

### Clue

Clues are structured data, not strings. They are encrypted and sent on air in ~3 bytes; the UI renders them as words.

```typescript
type Clue = 
  | { kind: 'not-possessed'; candle: number }
  | { kind: 'one-of-possessed'; a: number; b: number }
```

**Rules:**
- A `'not-possessed'` clue names a Living candle still in the game.
- A `'one-of-possessed'` clue names two different candles where at least one is Possessed still in the game.
- For a Living receiver, while `winner(state)` is null, both shapes are always possible because at least one other Living and one Possessed remain.
- For a Possessed receiver, the same shapes are used; with `rng` a clue is sometimes true and sometimes false.
- A clue never mentions the receiving candle and never mentions a banished candle.
- A false `'not-possessed'` clue names a Possessed candle (it protects a partner).

### GameState

The game state holds:
- `roles`: readonly Role array, one per candle (index 0..n-1)
- `banished`: ReadonlySet of candle indices that are banished
- `playerCount`: the initial player count (4–8)

```typescript
type GameState = {
  readonly roles: readonly Role[],
  readonly banished: ReadonlySet<number>,
  readonly playerCount: number
}
```

A player is "in the game" if their candle index is not in the `banished` set.

**Candle indexing:** candle numbers are 0-based indices everywhere in this module; the UI shows candle + 1.

## Function signatures

### assignRoles

```typescript
function assignRoles(
  playerCount: number,
  rng: () => number
): { ok: true; state: GameState } | { ok: false; error: 'bad-player-count' }
```

**Algorithm:**
1. Validate `playerCount` is 4–8; if not, return `{ ok: false, error: 'bad-player-count' }`.
2. Determine count of Possessed: 1 for 4–5, 2 for 6–8.
3. Create an array of `playerCount` roles: `Possessed` count + rest `Living`.
4. Shuffle using Fisher-Yates with the injected `rng`.
5. Return `{ ok: true, state: { roles: shuffled, banished: new Set(), playerCount } }`.

### makeOmen

```typescript
function makeOmen(
  state: GameState,
  rng: () => number
): ReadonlyMap<number, Clue>
```

**Algorithm:**
1. For each candle in the game (not yet banished):
   - If `Living`: generate a true clue about the current roles.
     - Pick a random other candle (not the receiver, not banished).
     - Either generate a `'not-possessed'` clue (if the target is Living) or a `'one-of-possessed'` clue (if at least one of two targets is Possessed).
   - If `Possessed`: generate a believable clue that may be true or false.
     - Use `rng` to decide randomly (50/50 or weighted) whether to tell the truth or a lie.
     - For a false `'not-possessed'` clue, name a Possessed candle (protects a partner).
     - For a false `'one-of-possessed'` clue, name two candles where the claim is false given actual roles.
2. Ensure the clue never names the receiving candle's index.
3. Ensure the clue never names a banished candle.
4. In `'one-of-possessed'`, the values `a` and `b` are always different.
5. Return a `ReadonlyMap<number, Clue>` mapping candle index to clue.

### banish

```typescript
function banish(
  state: GameState,
  candle: number
): { ok: true; role: Role; state: GameState } | { ok: false; error: 'unknown-candle' | 'already-banished' }
```

**Algorithm:**
1. Validate that `candle` is a valid index (0 to playerCount-1). If not, return `{ ok: false, error: 'unknown-candle' }`.
2. Check if `candle` is already in `state.banished`. If so, return `{ ok: false, error: 'already-banished' }`.
3. Create a new `GameState` with a new `banished` set including `candle`.
4. Return `{ ok: true, role: state.roles[candle], state: newState }`.

### winner

```typescript
function winner(state: GameState): 'living' | 'possessed' | null
```

**Algorithm:**
1. Count Possessed players still in the game: `livingPossessed = roles.filter((r, i) => r === 'Possessed' && !state.banished.has(i)).length`.
2. Count Living players still in the game: `livingLiving = roles.filter((r, i) => r === 'Living' && !state.banished.has(i)).length`.
3. If `livingPossessed === 0`, return `'living'` (all possessed banished).
4. If `livingPossessed >= livingLiving`, return `'possessed'` (possessed equals or outnumbers living; >= covers the equal case).
5. Otherwise, return `null` (game continues).

## Immutability and testing

- All functions return new objects; never mutate the input `state`.
- Functions are pure: same inputs always produce the same outputs (given the same `rng` sequence).
- Tests inject deterministic RNG functions (seeded or replaying a sequence) to control randomness and verify properties.

## RNG interface

```typescript
type RNG = () => number  // returns [0, 1) like Math.random()
```

Callers (tests and app code) provide the RNG:

```typescript
const deterministicRng = seededRandom(seed);
const roles = assignRoles(5, deterministicRng);
```

## Validation strategy

- **On bad input:** return `{ ok: false, error: string }` or throw on internal invariants.
- **On state errors:** return `{ ok: false, error: string }` with a descriptive message.
- **Never show partial state:** a failed operation returns the original state unchanged.

## Notes on clue design

Clues are the heart of the social game. They are structured data: either `{ kind: 'not-possessed'; candle: number }` or `{ kind: 'one-of-possessed'; a: number; b: number }`. They must:

- Be believable (even false clues must sound plausible).
- Never directly reveal a player's own candle number.
- Never mention a banished candle.
- Always be true for Living players (this is the difference: Living cannot lie).
- In `'one-of-possessed'`, always have `a !== b`.

For Possessed players, a believable false clue might be:
- `{ kind: 'not-possessed'; candle: 5 }` (when candle 5 is actually Possessed; protects a partner).
- `{ kind: 'one-of-possessed'; a: 2; b: 7 }` (when both are Living, or other false combinations).

The generation logic will use the RNG to pick which false clues to tell, so a Possessed player gets a mix of truths and lies.
