/**
 * Frame protocol constants.
 *
 * All frame size bounds and type markers live in this file, ensuring
 * no duplication across the protocol layer.
 */

/** Maximum frame length in bytes (ggwave hard limit is 140; leave headroom). */
export const MAX_FRAME = 128;

/** Minimum frame length in bytes. */
export const MIN_FRAME = 12;

/** Magic byte marking the start of the un-whitened region. */
export const MAGIC = 0x57;

/** Protocol version number (high nibble of version+type byte). */
export const VERSION = 1;

/** Frame type constant: manifest frame (seq = 0). */
export const FRAME_TYPE_MANIFEST = 0;

/** Frame type constant: data frame (seq ≥ 1). */
export const FRAME_TYPE_DATA = 1;

/** Frame type constant: repair-request frame. */
export const FRAME_TYPE_REPAIR_REQUEST = 2;

/** Replay guard window: suppress re-delivery within 10 minutes (600,000 ms). */
export const REPLAY_WINDOW_MS = 10 * 60 * 1000;
