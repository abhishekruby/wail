import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignRoles, makeOmen, banish, winner } from '../../src/game/rules.js';
import type { GameState, Role, Clue } from '../../src/game/types.js';

/**
 * Seeded PRNG using mulberry32 algorithm.
 * Returns a function that produces values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  return function () {
    // eslint-disable-next-line no-param-reassign
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a game state with randomly banished candles (but still in play).
 */
function buildGameStateInPlay(
  playerCount: number,
  rolesSeed: number,
  banishSeed: number
): GameState {
  const rng1 = mulberry32(rolesSeed);
  const result = assignRoles(playerCount, rng1);
  if (!result.ok) throw new Error('assignRoles failed');

  let state = result.state;
  const rng2 = mulberry32(banishSeed);

  // Banish a random number of candles, but only while the game stays in play.
  while (winner(state) === null && rng2() < 0.5) {
    // Pick a random living candle to banish.
    const living: number[] = [];
    for (let i = 0; i < state.playerCount; i += 1) {
      if (!state.banished.has(i)) {
        living.push(i);
      }
    }
    if (living.length === 0) break;

    const idx = Math.floor(rng2() * living.length);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const candle = living[idx]!;
    const banishResult = banish(state, candle);
    if (!banishResult.ok || winner(banishResult.state) !== null) break;
    state = banishResult.state;
  }

  return state;
}

describe('R23: Generate omens (true clues)', () => {
  it('G2a: Clues for Living players are always true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, banishSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish a few random candles while winner is null.
          const rng2 = mulberry32(banishSeed);
          while (winner(state) === null && rng2() < 0.3) {
            const living: number[] = [];
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                living.push(i);
              }
            }
            if (living.length === 0) break;
            const idx = Math.floor(rng2() * living.length);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const candle = living[idx]!;
            const br = banish(state, candle);
            if (br.ok) {
              state = br.state;
            }
          }

          const rng3 = mulberry32(omSeed);
          const omens = makeOmen(state, rng3);

          // For each Living player, check the clue is true.
          for (let receiver = 0; receiver < state.playerCount; receiver += 1) {
            if (state.banished.has(receiver)) continue;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const receiverRole = state.roles[receiver]!;
            if (receiverRole !== 'Living') continue;

            const clue = omens.get(receiver);
            expect(clue).toBeDefined();
            if (!clue) return;

            if (clue.kind === 'not-possessed') {
              // Clue claims candle is Living; it must be.
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const role = state.roles[clue.candle]!;
              expect(role).toBe('Living');
            } else if (clue.kind === 'one-of-possessed') {
              // At least one of a or b must be Possessed.
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const roleA = state.roles[clue.a]!;
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const roleB = state.roles[clue.b]!;
              const isPossessed =
                roleA === 'Possessed' || roleB === 'Possessed';
              expect(isPossessed).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G2b: Clues have correct Clue structure', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          const rng2 = mulberry32(omSeed);
          const omens = makeOmen(state, rng2);

          for (const clue of omens.values()) {
            expect(clue).toBeDefined();
            expect(['not-possessed', 'one-of-possessed']).toContain(
              clue.kind
            );

            if (clue.kind === 'not-possessed') {
              expect(typeof clue.candle).toBe('number');
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.candle!).toBeGreaterThanOrEqual(0);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.candle!).toBeLessThan(playerCount);
            } else if (clue.kind === 'one-of-possessed') {
              expect(typeof clue.a).toBe('number');
              expect(typeof clue.b).toBe('number');
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.a!).toBeGreaterThanOrEqual(0);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.b!).toBeGreaterThanOrEqual(0);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.a!).toBeLessThan(playerCount);
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(clue.b!).toBeLessThan(playerCount);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G2c: Clues never name the receiving candle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          const rng2 = mulberry32(omSeed);
          const omens = makeOmen(state, rng2);

          for (let receiver = 0; receiver < state.playerCount; receiver += 1) {
            if (state.banished.has(receiver)) continue;

            const clue = omens.get(receiver);
            expect(clue).toBeDefined();
            if (!clue) return;

            if (clue.kind === 'not-possessed') {
              expect(clue.candle).not.toBe(receiver);
            } else if (clue.kind === 'one-of-possessed') {
              expect(clue.a).not.toBe(receiver);
              expect(clue.b).not.toBe(receiver);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G2d: Clues never mention banished candles', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, banishSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish a few random candles.
          const rng2 = mulberry32(banishSeed);
          while (winner(state) === null && rng2() < 0.3) {
            const living: number[] = [];
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                living.push(i);
              }
            }
            if (living.length === 0) break;
            const idx = Math.floor(rng2() * living.length);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const candle = living[idx]!;
            const br = banish(state, candle);
            if (br.ok) {
              state = br.state;
            }
          }

          const rng3 = mulberry32(omSeed);
          const omens = makeOmen(state, rng3);

          for (const clue of omens.values()) {
            if (clue.kind === 'not-possessed') {
              expect(state.banished.has(clue.candle)).toBe(false);
            } else if (clue.kind === 'one-of-possessed') {
              expect(state.banished.has(clue.a)).toBe(false);
              expect(state.banished.has(clue.b)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G2e: In one-of-possessed clues, a and b are different and a < b', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          const rng2 = mulberry32(omSeed);
          const omens = makeOmen(state, rng2);

          for (const clue of omens.values()) {
            if (clue.kind === 'one-of-possessed') {
              expect(clue.a).not.toBe(clue.b);
              expect(clue.a).toBeLessThan(clue.b);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G2f: Exactly one clue per candle still in the game', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, banishSeed, omSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish a few random candles.
          const rng2 = mulberry32(banishSeed);
          while (winner(state) === null && rng2() < 0.3) {
            const living: number[] = [];
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                living.push(i);
              }
            }
            if (living.length === 0) break;
            const idx = Math.floor(rng2() * living.length);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const candle = living[idx]!;
            const br = banish(state, candle);
            if (br.ok) {
              state = br.state;
            }
          }

          const rng3 = mulberry32(omSeed);
          const omens = makeOmen(state, rng3);

          // Count living candles.
          let livingCount = 0;
          for (let i = 0; i < state.playerCount; i += 1) {
            if (!state.banished.has(i)) {
              livingCount += 1;
            }
          }

          // Every living candle must have exactly one clue.
          expect(omens.size).toBe(livingCount);
          for (let i = 0; i < state.playerCount; i += 1) {
            if (!state.banished.has(i)) {
              expect(omens.has(i)).toBe(true);
            } else {
              expect(omens.has(i)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
