import type {
  Clue,
  GameState,
  RNG,
  Role,
  RoleResult,
  OmenResult,
  BanishResult,
} from './types.js';

function oneOf(x: number, y: number): Clue {
  return x < y
    ? { kind: 'one-of-possessed', a: x, b: y }
    : { kind: 'one-of-possessed', a: y, b: x };
}

/**
 * Assign roles to players at the start of the game.
 *
 * Validates player count, determines Possessed count based on the range,
 * creates a role array, and shuffles it using Fisher-Yates with the injected RNG.
 *
 * @param playerCount - number of players (must be 4–8)
 * @param rng - injected RNG function returning [0, 1)
 * @returns `{ ok: true, state: GameState }` on success, or `{ ok: false, error: 'bad-player-count' }` on invalid count
 *
 * @example
 * // Seed deterministic RNG for testing
 * const rng = seededRandom(42);
 * const result = assignRoles(5, rng);
 * // result.ok === true && result.state.roles.filter(r => r === 'Possessed').length === 1
 *
 * @example
 * // Invalid player count
 * const result = assignRoles(3, Math.random);
 * // result.ok === false && result.error === 'bad-player-count'
 */
export function assignRoles(
  playerCount: number,
  rng: RNG
): RoleResult {
  if (playerCount < 4 || playerCount > 8) {
    return { ok: false, error: 'bad-player-count' };
  }

  // Determine Possessed count: 1 for 4–5 players, 2 for 6–8 players.
  const possessedCount = playerCount <= 5 ? 1 : 2;

  // Create role array: Possessed first, then Living.
  const roles: Role[] = [];
  for (let i = 0; i < possessedCount; i++) {
    roles.push('Possessed');
  }
  for (let i = 0; i < playerCount - possessedCount; i++) {
    roles.push('Living');
  }

  // Fisher-Yates shuffle.
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const temp = roles[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    roles[i] = roles[j]!;
    roles[j] = temp;
  }

  return {
    ok: true,
    state: {
      roles,
      banished: new Set(),
      playerCount,
    },
  };
}

/**
 * Generate clues for all players still in the game.
 *
 * For each living candle, generates one clue:
 * - Living players always receive true clues.
 * - Possessed players receive a mix of true and false clues (decided by RNG).
 *
 * Clues never mention the receiving candle or any banished candle.
 * In 'one-of-possessed' clues, a and b are always different.
 *
 * @param state - current game state
 * @param rng - injected RNG function returning [0, 1)
 * @returns ReadonlyMap mapping candle index to clue
 *
 * @example
 * const state = { roles: ['Living', 'Possessed', 'Living'], banished: new Set(), playerCount: 3 };
 * const omens = makeOmen(state, Math.random);
 * // omens.size === 3
 * // omens.get(1).kind might be 'not-possessed' (a lie protecting a partner)
 */
export function makeOmen(
  state: GameState,
  rng: RNG
): OmenResult {
  const omens = new Map<number, Clue>();

  // For each candle still in the game.
  for (let receiver = 0; receiver < state.playerCount; receiver += 1) {
    if (state.banished.has(receiver)) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const receiverRole = state.roles[receiver]!;

    if (receiverRole === 'Living') {
      // Living players always receive true clues.
      const clue = generateTrueClue(state, receiver, rng);
      omens.set(receiver, clue);
    } else {
      // Possessed players receive a mix of true and false clues.
      // Decide with 50/50 chance whether to tell the truth or lie.
      const tellTruth = rng() < 0.5;
      let clue: Clue;
      if (tellTruth) {
        clue = generateTrueClue(state, receiver, rng);
      } else {
        clue = generateFalseClue(state, receiver, rng);
      }
      omens.set(receiver, clue);
    }
  }

  return omens;
}

/**
 * Generate a true clue for a receiver.
 * The clue is factually true about current roles and living candles.
 *
 * @internal
 */
function generateTrueClue(
  state: GameState,
  receiver: number,
  rng: RNG
): Clue {
  // Collect all candles still in the game except the receiver.
  const candidates: number[] = [];
  for (let i = 0; i < state.playerCount; i += 1) {
    if (i !== receiver && !state.banished.has(i)) {
      candidates.push(i);
    }
  }

  // Find Living and Possessed candles among candidates.
  const livingCandidates = candidates.filter(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (i) => state.roles[i]! === 'Living'
  );
  const possessedCandidates = candidates.filter(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (i) => state.roles[i]! === 'Possessed'
  );

  // For a true clue, we can generate either shape if at least one of each type exists.
  // If only one type is available, use the matching clue.
  if (livingCandidates.length > 0 && possessedCandidates.length > 0) {
    // Both shapes possible; choose one with 50/50 chance.
    if (rng() < 0.5 && livingCandidates.length > 0) {
      // 'not-possessed' clue: name a Living candle.
      const idx = Math.floor(rng() * livingCandidates.length);
      return {
        kind: 'not-possessed',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        candle: livingCandidates[idx]!,
      };
    } else {
      // 'one-of-possessed' clue: name two candles where at least one is Possessed.
      // Pick one Possessed, then one other candidate.
      const possIdx = Math.floor(rng() * possessedCandidates.length);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const poss = possessedCandidates[possIdx]!;
      const otherIdx = Math.floor(rng() * candidates.length);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      let other = candidates[otherIdx]!;
      // Ensure a !== b.
      if (other === poss) {
        other =
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          candidates[(otherIdx + 1) % candidates.length]!;
      }
      return oneOf(poss, other);
    }
  } else if (livingCandidates.length > 0) {
    // Only Living candles available; use 'not-possessed'.
    const idx = Math.floor(rng() * livingCandidates.length);
    return {
      kind: 'not-possessed',
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      candle: livingCandidates[idx]!,
    };
  } else {
    // Only Possessed candles available; use 'one-of-possessed'.
    const a = possessedCandidates[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const b = possessedCandidates[1]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    return oneOf(a, b);
  }
}

/**
 * Generate a false clue for a Possessed receiver.
 * The clue is believable but factually false.
 *
 * @internal
 */
function generateFalseClue(
  state: GameState,
  receiver: number,
  rng: RNG
): Clue {
  // Collect all candles still in the game except the receiver.
  const candidates: number[] = [];
  for (let i = 0; i < state.playerCount; i += 1) {
    if (i !== receiver && !state.banished.has(i)) {
      candidates.push(i);
    }
  }

  const livingCandidates = candidates.filter(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (i) => state.roles[i]! === 'Living'
  );
  const possessedCandidates = candidates.filter(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (i) => state.roles[i]! === 'Possessed'
  );

  // Build allowed false clues.
  const falseClues: Clue[] = [];

  // False 'not-possessed': name a Possessed candle (protects a partner).
  for (const poss of possessedCandidates) {
    falseClues.push({ kind: 'not-possessed', candle: poss });
  }

  // False 'one-of-possessed': name two Living candles (or other false combinations).
  if (livingCandidates.length >= 2) {
    for (let i = 0; i < livingCandidates.length; i += 1) {
      for (let j = i + 1; j < livingCandidates.length; j += 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        falseClues.push(
          oneOf(livingCandidates[i]!, livingCandidates[j]!)
        );
      }
    }
  }

  // If no false clues are possible, return a true clue instead.
  if (falseClues.length === 0) {
    return generateTrueClue(state, receiver, rng);
  }

  // Pick a random false clue.
  const idx = Math.floor(rng() * falseClues.length);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return falseClues[idx]!;
}

/**
 * Banish a player from the game.
 *
 * Validates that the candle index is in range and not already banished.
 * Returns the role of the banished player and an updated game state.
 *
 * @param state - current game state (never mutated)
 * @param candle - candle index to banish (0-based)
 * @returns On success: `{ ok: true, role: ..., state: ... }`. On error: `{ ok: false, error: ... }`
 *
 * @example
 * const state = { roles: ['Living', 'Possessed'], banished: new Set(), playerCount: 2 };
 * const result = banish(state, 0);
 * // result.ok === true && result.role === 'Living' && result.state.banished.has(0)
 *
 * @example
 * const state = { roles: ['Living', 'Possessed'], banished: new Set([0]), playerCount: 2 };
 * const result = banish(state, 0);
 * // result.ok === false && result.error === 'already-banished'
 */
export function banish(
  state: GameState,
  candle: number
): BanishResult {
  // Validate candle is in range.
  if (candle < 0 || candle >= state.playerCount) {
    return { ok: false, error: 'unknown-candle' };
  }

  // Check if already banished.
  if (state.banished.has(candle)) {
    return { ok: false, error: 'already-banished' };
  }

  // Create new state with updated banished set.
  const newBanished = new Set(state.banished);
  newBanished.add(candle);

  return {
    ok: true,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    role: state.roles[candle]!,
    state: {
      ...state,
      banished: newBanished,
    },
  };
}

/**
 * Check for a winner in the current game state.
 *
 * Returns:
 * - 'living': all Possessed players are banished (Living wins).
 * - 'possessed': Possessed count >= Living count (Possessed wins).
 * - null: game continues.
 *
 * @param state - current game state
 * @returns Winner or null if game continues
 *
 * @example
 * const state = { roles: ['Living', 'Possessed'], banished: new Set([1]), playerCount: 2 };
 * const result = winner(state);
 * // result === 'living'
 *
 * @example
 * const state = { roles: ['Living', 'Possessed', 'Living'], banished: new Set([0]), playerCount: 3 };
 * const result = winner(state);
 * // result === 'possessed' (1 Possessed, 1 Living left; Possessed >= Living)
 */
export function winner(
  state: GameState
): 'living' | 'possessed' | null {
  let livingCount = 0;
  let possessedCount = 0;

  for (let i = 0; i < state.playerCount; i += 1) {
    if (!state.banished.has(i)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (state.roles[i]! === 'Living') {
        livingCount += 1;
      } else {
        possessedCount += 1;
      }
    }
  }

  // All Possessed banished: Living wins.
  if (possessedCount === 0) {
    return 'living';
  }

  // Possessed >= Living: Possessed wins.
  if (possessedCount >= livingCount) {
    return 'possessed';
  }

  // Game continues.
  return null;
}
