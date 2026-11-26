import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignRoles } from '../../src/game/rules.js';
import type { Role } from '../../src/game/types.js';

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

describe('R22: Assign roles', () => {
  it('G1a: 4–5 players have exactly 1 Possessed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 5 }), fc.nat(), (count, seed) => {
        const rng = mulberry32(seed);
        const result = assignRoles(count, rng);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { state } = result;
        expect(state.roles.length).toBe(count);
        const possessedCount = state.roles.filter(
          (r: Role) => r === 'Possessed'
        ).length;
        expect(possessedCount).toBe(1);
      }),
      { numRuns: 200 }
    );
  });

  it('G1b: 6–8 players have exactly 2 Possessed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 8 }), fc.nat(), (count, seed) => {
        const rng = mulberry32(seed);
        const result = assignRoles(count, rng);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { state } = result;
        expect(state.roles.length).toBe(count);
        const possessedCount = state.roles.filter(
          (r: Role) => r === 'Possessed'
        ).length;
        expect(possessedCount).toBe(2);
      }),
      { numRuns: 200 }
    );
  });

  it('G1c: Never 0 Possessed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (count, seed) => {
          const rng = mulberry32(seed);
          const result = assignRoles(count, rng);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { state } = result;
          const possessedCount = state.roles.filter(
            (r: Role) => r === 'Possessed'
          ).length;
          expect(possessedCount).toBeGreaterThan(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G1d: All roles are valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (count, seed) => {
          const rng = mulberry32(seed);
          const result = assignRoles(count, rng);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { state } = result;
          for (const role of state.roles) {
            expect(['Living', 'Possessed']).toContain(role);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G1e: Same seed produces same roles (deterministic)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (count, seed) => {
          const rng1 = mulberry32(seed);
          const result1 = assignRoles(count, rng1);

          const rng2 = mulberry32(seed);
          const result2 = assignRoles(count, rng2);

          expect(result1.ok).toBe(true);
          expect(result2.ok).toBe(true);
          if (!result1.ok || !result2.ok) return;

          expect(result1.state.roles).toEqual(result2.state.roles);
          expect(result1.state.playerCount).toBe(result2.state.playerCount);
          expect([...result1.state.banished]).toEqual([
            ...result2.state.banished,
          ]);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G1f: Invalid counts (0–3, 9–20) return bad-player-count', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 9, max: 20 })
        ),
        (count) => {
          const result = assignRoles(count, Math.random);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error).toBe('bad-player-count');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G1g: Role array length equals playerCount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (count, seed) => {
          const rng = mulberry32(seed);
          const result = assignRoles(count, rng);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { state } = result;
          expect(state.roles.length).toBe(state.playerCount);
          expect(state.roles.length).toBe(count);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('G1h: Banished set starts empty', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),
        fc.nat(),
        (count, seed) => {
          const rng = mulberry32(seed);
          const result = assignRoles(count, rng);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { state } = result;
          expect(state.banished.size).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });
});
