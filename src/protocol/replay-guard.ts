/**
 * Replay guard: suppresses re-delivery of messages within a 10-minute window.
 *
 * Tracks recently completed message_id values and evicts stale entries lazily.
 * Accepts an injectable clock for deterministic testing.
 */

import { REPLAY_WINDOW_MS } from './constants.js';

/**
 * ReplayGuard tracks recently completed message_id values.
 *
 * State: Map<number, number> mapping message_id → recorded_at_ms.
 *
 * Eviction strategy: lazy — on every record() call, sweep the map and delete
 * entries where clock() - recorded_at > REPLAY_WINDOW_MS.
 *
 * Clock injection: accepts an optional () => number clock (default Date.now).
 * Property tests advance the clock by passing a custom function that returns
 * controlled timestamps, so no real wall-clock delay is needed in tests.
 */
export class ReplayGuard {
  private messages: Map<number, number> = new Map();
  private clock: () => number;

  /**
   * Create a new ReplayGuard with an optional injectable clock.
   *
   * @param clock Optional function returning current time in milliseconds (default: Date.now).
   */
  constructor(clock?: () => number) {
    this.clock = clock ?? (() => Date.now());
  }

  /**
   * Check if a message_id was recorded within the last REPLAY_WINDOW_MS.
   *
   * @param messageId The message identifier to check.
   * @returns true if the message_id is in the replay guard (recently delivered), false otherwise.
   */
  has(messageId: number): boolean {
    const recordedAt = this.messages.get(messageId);
    if (recordedAt === undefined) {
      return false;
    }

    const now = this.clock();
    if (now - recordedAt > REPLAY_WINDOW_MS) {
      // Entry is stale, remove it
      this.messages.delete(messageId);
      return false;
    }

    return true;
  }

  /**
   * Record a message_id as completed at the current clock time.
   * Lazily evicts stale entries where clock() - recorded_at > REPLAY_WINDOW_MS.
   *
   * @param messageId The message identifier to record.
   */
  record(messageId: number): void {
    const now = this.clock();

    // Lazy eviction: sweep the map and delete stale entries
    const toDelete: number[] = [];
    for (const [id, recordedAt] of this.messages.entries()) {
      if (now - recordedAt > REPLAY_WINDOW_MS) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.messages.delete(id);
    }

    // Record the new message_id
    this.messages.set(messageId, now);
  }
}
