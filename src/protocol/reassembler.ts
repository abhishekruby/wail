/**
 * Message reassembler: collects frames by message_id, detects completeness,
 * and verifies CRC-32 integrity of the reassembled payload.
 *
 * Handles:
 * - Data frames before the manifest (buffered until manifest arrives)
 * - Duplicate seq (first copy kept)
 * - Repair-request frames (type 2) return 'incomplete' without side effects
 * - Late-manifest delivery (data frames arrive before seq=0)
 * - CRC-32 verification on completion
 * - Replay guard integration
 * - Lazy expiry of stale transfers
 */

import { REPLAY_WINDOW_MS, FRAME_TYPE_MANIFEST, FRAME_TYPE_DATA } from './constants.js';
import { crc32 } from './crc32.js';
import { parseManifest } from './manifest.js';
import { ReplayGuard } from './replay-guard.js';
import type { DecodedFrame, ManifestBody, ReassemblerOptions, ReassemblyResult } from './types.js';

/**
 * Per-transfer buffer state.
 * Never exported; internal to the reassembler.
 */
interface Transfer {
  manifest: ManifestBody | null;
  frames: Map<number, Uint8Array>; // seq → body bytes
  lastSeen: number; // ms timestamp from injected clock
}

/**
 * Create a reassembler that collects frames and detects message completeness.
 *
 * Returns an object with:
 *   - feed(frame: DecodedFrame): ReassemblyResult — process one decoded frame
 *   - expireStale(): void — manually expire transfers older than REPLAY_WINDOW_MS
 *
 * The injected clock (default Date.now) controls all time-dependent behavior.
 * The replay guard (default new ReplayGuard(clock)) suppresses re-delivery within 10 minutes.
 */
export function createReassembler(options?: ReassemblerOptions): {
  feed(frame: DecodedFrame): ReassemblyResult;
  expireStale(): void;
} {
  const clock = options?.clock ?? (() => Date.now());
  const replayGuard = options?.replayGuard ?? new ReplayGuard(clock);

  // Per-message_id transfer state
  const transfers: Map<number, Transfer> = new Map();

  /**
   * Check if a transfer is complete: manifest present and all seq 1..totalFrames present.
   */
  function isComplete(transfer: Transfer): boolean {
    if (transfer.manifest === null) {
      return false;
    }
    const totalFrames = transfer.manifest.totalFrames;
    if (totalFrames === 0) {
      // Empty message (manifest with totalFrames=0)
      return true;
    }
    if (transfer.frames.size < totalFrames) {
      return false;
    }
    // Check that every seq in 1..totalFrames is present
    for (let seq = 1; seq <= totalFrames; seq++) {
      if (!transfer.frames.has(seq)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Expire transfers that have been idle for more than REPLAY_WINDOW_MS.
   * Called lazily on each feed() call.
   */
  function expireStaleInternal(): void {
    const now = clock();
    const toDelete: number[] = [];
    for (const [messageId, transfer] of transfers.entries()) {
      if (now - transfer.lastSeen > REPLAY_WINDOW_MS) {
        toDelete.push(messageId);
      }
    }
    for (const messageId of toDelete) {
      transfers.delete(messageId);
    }
  }

  /**
   * Process one decoded frame and return reassembly status.
   */
  function feed(frame: DecodedFrame): ReassemblyResult {
    const { messageId, type } = frame;

    // Expire stale transfers lazily
    expireStaleInternal();

    // Check replay guard: if replayed, return 'replayed' without buffering
    if (replayGuard.has(messageId)) {
      return { status: 'replayed' };
    }

    // Repair-request frames (type 2) are accepted but ignored
    if (type === 2) {
      return { status: 'incomplete' };
    }

    // Get or create transfer entry
    let transfer = transfers.get(messageId);
    if (!transfer) {
      transfer = {
        manifest: null,
        frames: new Map(),
        lastSeen: clock(),
      };
      transfers.set(messageId, transfer);
    } else {
      // Update lastSeen
      transfer.lastSeen = clock();
    }

    // Handle manifest frame (seq = 0, type = 0)
    if (type === FRAME_TYPE_MANIFEST) {
      // Parse the manifest body
      const parseResult = parseManifest(frame.body);
      if (!parseResult.ok) {
        // Parse failed; ignore this manifest frame and return 'incomplete'
        return { status: 'incomplete' };
      }

      // Set the manifest (overwrites previous if retransmitted)
      transfer.manifest = parseResult.value;

      // Check if now complete
      if (!isComplete(transfer)) {
        return { status: 'incomplete' };
      }

      // Complete: join frames, verify CRC-32, record in replay guard
      return completeTransfer(messageId, transfer);
    }

    // Handle data frame (seq >= 1, type = 1)
    if (type === FRAME_TYPE_DATA) {
      const { seq, body } = frame;

      // Buffer this frame if not already present (duplicate handling: first copy kept)
      if (!transfer.frames.has(seq)) {
        transfer.frames.set(seq, new Uint8Array(body));
      }

      // Check if now complete
      if (!isComplete(transfer)) {
        return { status: 'incomplete' };
      }

      // Complete: join frames, verify CRC-32, record in replay guard
      return completeTransfer(messageId, transfer);
    }

    return { status: 'incomplete' };
  }

  /**
   * Join frames for a complete transfer, verify CRC-32, and record in replay guard.
   * On success: record messageId and delete transfer.
   * On CRC failure: clear frames, reset manifest, keep transfer alive for retry.
   */
  function completeTransfer(messageId: number, transfer: Transfer): ReassemblyResult {
    const manifest = transfer.manifest!;

    // Join data frame bodies in seq order
    const payloadChunks: Uint8Array[] = [];

    if (manifest.totalFrames > 0) {
      for (let seq = 1; seq <= manifest.totalFrames; seq++) {
        const frameBody = transfer.frames.get(seq);
        if (!frameBody) {
          // This should not happen if isComplete() is correct, but guard against it
          return { status: 'incomplete' };
        }
        payloadChunks.push(frameBody);
      }
    }

    // Concatenate all chunks
    const totalLen = payloadChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const joined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of payloadChunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }

    // Trim to payloadLen
    const payload = joined.subarray(0, manifest.payloadLen);

    // Verify CRC-32
    const computedCrc = crc32(payload);
    if (computedCrc !== manifest.crc32) {
      // CRC-32 mismatch: clear frames and reset manifest, keep transfer alive
      transfer.frames.clear();
      transfer.manifest = null;
      transfer.lastSeen = clock();
      return { status: 'crc-fail' };
    }

    // CRC-32 pass: record in replay guard and delete transfer
    replayGuard.record(messageId);
    transfers.delete(messageId);

    return { status: 'complete', payload: new Uint8Array(payload) };
  }

  return {
    feed,
    expireStale: expireStaleInternal,
  };
}
