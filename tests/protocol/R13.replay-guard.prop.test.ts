/**
 * Property 8: Replay guard suppresses re-delivery
 *
 * For any successfully delivered message, feeding the same frames again within
 * the 10-minute replay window returns { status: 'replayed' } for every subsequent
 * attempt. After the clock advances past 10 minutes, feeding the same frames
 * returns { status: 'complete' } again.
 *
 * Uses injected clock returning controlled timestamps, so no real wall-clock delay
 * is needed in tests.
 *
 * Tests Requirements 7.1, 7.2, 7.3
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { splitPayload, createReassembler, decodeFrame, ReplayGuard } from '../../src/protocol/index.js';
import type { RngSource } from '../../src/protocol/types.js';

describe('R13.replay-guard (Property 8: Replay guard suppresses re-delivery)', () => {
  it('should return replayed within 10 minutes, then complete after', () => {
    const deterministicRng: RngSource = (() => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) & 0xff;
      };
    })();

    const REPLAY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 2048 }),
        (payload: Uint8Array) => {
          // Split the payload into frames
          const splitResult = splitPayload(payload, {
            kind: 0,
            flags: { compressed: false, locked: false, broadcast: false },
            rng: deterministicRng,
          });

          if (!splitResult.ok) {
            return true;
          }

          const frames = splitResult.frames;

          if (frames.length === 0) {
            return true;
          }

          // Decode all frames
          const decodedFrames = frames.map((f) => decodeFrame(f));
          if (decodedFrames.some((f) => f === null)) {
            return false;
          }

          const decoded = decodedFrames as NonNullable<typeof decodedFrames[number]>[];

          // Test 1: First delivery should complete
          let now = 0;
          const clock = () => now;

          const reassembler1 = createReassembler({ clock, replayGuard: new ReplayGuard(clock) });
          let firstComplete = false;

          for (const frame of decoded) {
            const result = reassembler1.feed(frame);
            if (result.status === 'complete') {
              firstComplete = true;
            }
          }

          if (!firstComplete) {
            return false;
          }

          // Test 2: Redelivery within 10 minutes should be replayed
          const reassembler2 = createReassembler({ clock, replayGuard: new ReplayGuard(clock) });

          // Feed the first delivery to establish the replay guard state
          for (const frame of decoded) {
            reassembler2.feed(frame);
          }

          // Now try to feed again, still within 10 minutes
          now = REPLAY_WINDOW_MS - 1; // Within window
          let secondWasReplayed = false;

          for (const frame of decoded) {
            const result = reassembler2.feed(frame);
            if (result.status === 'replayed') {
              secondWasReplayed = true;
            }
          }

          if (!secondWasReplayed) {
            return false;
          }

          // Test 3: After 10 minutes, redelivery should complete again
          now = REPLAY_WINDOW_MS + 1; // After window
          let thirdComplete = false;

          for (const frame of decoded) {
            const result = reassembler2.feed(frame);
            if (result.status === 'complete') {
              thirdComplete = true;
            }
          }

          return thirdComplete;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
