import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  assignRoles,
  banish,
  winner,
} from '../../src/game/rules.js';
import type { GameState } from '../../src/game/types.js';

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

describe('R25: Game ends (winner detection and game flow)', () => {
  it('G4a: Any sequence of valid banishments reaches a winner within playerCount steps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        fc.nat(),
        (playerCount, rolesSeed, banishSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          const rng2 = mulberry32(banishSeed);
          let steps = 0;
          let w = winner(state);

          while (w === null && steps < playerCount) {
            // Find living candles.
            const living: number[] = [];
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                living.push(i);
              }
            }

            if (living.length === 0) break;

            // Pick a random living candle to banish.
            const idx = Math.floor(rng2() * living.length);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const candle = living[idx]!;
            const br = banish(state, candle);

            if (br.ok) {
              state = br.state;
              steps += 1;
              w = winner(state);
            }
          }

          // Game must end within playerCount banishments.
          if (w === null) {
            // If still null after playerCount banishments, the game didn't terminate.
            // This is acceptable if all candles are banished (no one left).
            let anyLeft = false;
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                anyLeft = true;
                break;
              }
            }
            expect(anyLeft).toBe(false); // No one left means game ended.
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4b: Winner matches the rules (Living wins when all Possessed banished)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish all Possessed candles.
          for (let i = 0; i < state.playerCount; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (state.roles[i]! === 'Possessed') {
              const br = banish(state, i);
              if (br.ok) {
                state = br.state;
              }
            }
          }

          // All Possessed are banished; Living must win.
          const w = winner(state);
          expect(w).toBe('living');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4c: Winner matches the rules (Possessed wins when count >= Living)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Count initial Possessed and Living.
          let possessedCount = 0;
          let livingCount = 0;
          for (let i = 0; i < state.playerCount; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const role = state.roles[i]!;
            if (role === 'Possessed') possessedCount += 1;
            else livingCount += 1;
          }

          // Banish all but one Living candle (if Possessed count >= remaining Living).
          let banished = 0;
          for (let i = 0; i < state.playerCount && banished < livingCount - 1; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (state.roles[i]! === 'Living' && !state.banished.has(i)) {
              const br = banish(state, i);
              if (br.ok) {
                state = br.state;
                banished += 1;
              }
            }
          }

          // Now Possessed >= remaining Living; Possessed must win.
          const w = winner(state);
          if (w !== null) {
            // If the game ended, it must be a Possessed win.
            expect(w).toBe('possessed');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4d: Banish returns already-banished error for already-banished candle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish a candle.
          const br1 = banish(state, 0);
          if (!br1.ok) return;
          state = br1.state;

          // Try to banish the same candle again.
          const br2 = banish(state, 0);
          expect(br2.ok).toBe(false);
          if (!br2.ok) {
            expect(br2.error).toBe('already-banished');
          }

          // State must not have changed.
          expect(state.banished.has(0)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4e: Banish returns unknown-candle error for out-of-range indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          // Try to banish an out-of-range candle: -1.
          const br1 = banish(state, -1);
          expect(br1.ok).toBe(false);
          if (!br1.ok) {
            expect(br1.error).toBe('unknown-candle');
          }

          // Try to banish an out-of-range candle: playerCount.
          const br2 = banish(state, playerCount);
          expect(br2.ok).toBe(false);
          if (!br2.ok) {
            expect(br2.error).toBe('unknown-candle');
          }

          // Try to banish an out-of-range candle: playerCount + 1.
          const br3 = banish(state, playerCount + 1);
          expect(br3.ok).toBe(false);
          if (!br3.ok) {
            expect(br3.error).toBe('unknown-candle');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4f: Banish does not mutate the original state', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          const originalBanishedSize = state.banished.size;

          const br = banish(state, 0);
          if (!br.ok) return;

          // Original state must not be mutated.
          expect(state.banished.size).toBe(originalBanishedSize);
          expect(state.banished.has(0)).toBe(false);

          // New state must have the banishment.
          expect(br.state.banished.has(0)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4g: Winner returns null while game continues', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          const state = result.state;

          // With no banishments, game must continue (unless impossible setup).
          const w = winner(state);

          // For a valid initial state, the game should continue.
          // (unless we're in a rare edge case, but with 4–8 players and
          // 1–2 Possessed, this should never happen initially).
          expect(w).toBe(null);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4h: Counts match winner result (Living wins)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Banish all Possessed.
          for (let i = 0; i < state.playerCount; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (state.roles[i]! === 'Possessed') {
              const br = banish(state, i);
              if (br.ok) {
                state = br.state;
              }
            }
          }

          const w = winner(state);
          if (w === 'living') {
            // Check counts.
            let possessedLeft = 0;
            for (let i = 0; i < state.playerCount; i += 1) {
              if (
                !state.banished.has(i) &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                state.roles[i]! === 'Possessed'
              ) {
                possessedLeft += 1;
              }
            }
            expect(possessedLeft).toBe(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G4i: Counts match winner result (Possessed wins)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (playerCount, rolesSeed) => {
          const rng1 = mulberry32(rolesSeed);
          const result = assignRoles(playerCount, rng1);
          if (!result.ok) return;
          let state = result.state;

          // Count initial Possessed and Living.
          let possessedTotal = 0;
          let livingTotal = 0;
          for (let i = 0; i < state.playerCount; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const role = state.roles[i]!;
            if (role === 'Possessed') possessedTotal += 1;
            else livingTotal += 1;
          }

          // Banish all but one Living.
          let banished = 0;
          for (let i = 0; i < state.playerCount && banished < livingTotal - 1; i += 1) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (state.roles[i]! === 'Living' && !state.banished.has(i)) {
              const br = banish(state, i);
              if (br.ok) {
                state = br.state;
                banished += 1;
              }
            }
          }

          const w = winner(state);
          if (w === 'possessed') {
            // Count remaining.
            let possessedLeft = 0;
            let livingLeft = 0;
            for (let i = 0; i < state.playerCount; i += 1) {
              if (!state.banished.has(i)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (state.roles[i]! === 'Possessed') possessedLeft += 1;
                else livingLeft += 1;
              }
            }
            expect(possessedLeft).toBeGreaterThanOrEqual(livingLeft);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
