/**
 * Role of a player in Séance.
 * - 'Living': a regular player trying to find and banish the Possessed.
 * - 'Possessed': a ghost trying to avoid banishment and outnumber the Living.
 */
export type Role = 'Living' | 'Possessed';

/**
 * A clue given to a player about the roles in the game.
 * Clues are structured data, encrypted and sent on air in ~3 bytes; the UI renders them as words.
 *
 * @property 'not-possessed' - claims a named candle is Living (true for Living players, may be false for Possessed).
 * @property 'one-of-possessed' - claims at least one of two named candles is Possessed (true for Living players, may be false for Possessed).
 *
 * Constraints:
 * - A clue never names the receiving candle's index.
 * - A clue never names a banished candle.
 * - In 'one-of-possessed', a and b are always different.
 */
export type Clue =
  | { kind: 'not-possessed'; candle: number }
  | { kind: 'one-of-possessed'; a: number; b: number };

/**
 * Injected randomness function.
 * Returns a value in [0, 1) like Math.random().
 * Used to make the game rules engine deterministic and testable.
 */
export type RNG = () => number;

/**
 * The complete game state at any point.
 *
 * @property roles - array of roles, one per candle (index 0..playerCount-1). Never mutated.
 * @property banished - set of candle indices that have been banished. Never mutated; new Set is created on each change.
 * @property playerCount - the initial number of players (4–8). Never changes.
 *
 * A player is "in the game" (alive) if their candle index is not in banished.
 * Candle numbers are 0-based indices throughout this module; the UI shows candle + 1.
 */
export type GameState = {
  readonly roles: readonly Role[];
  readonly banished: ReadonlySet<number>;
  readonly playerCount: number;
};

/**
 * Tagged error result.
 * Used by functions that may fail on bad input (e.g., bad player count, unknown candle).
 */
export type GameError = { ok: false; error: string };

/**
 * Result of assignRoles: either a valid game state or an error.
 */
export type RoleResult =
  | { ok: true; state: GameState }
  | GameError;

/**
 * Result of makeOmen: a map of candle indices to their clues.
 * Never returns an error; always succeeds given a valid GameState.
 */
export type OmenResult = ReadonlyMap<number, Clue>;

/**
 * Result of banish: either the banished player's role and updated state, or an error.
 */
export type BanishResult =
  | { ok: true; role: Role; state: GameState }
  | GameError;
