/**
 * Shared TypeScript interfaces and type aliases for the crypto layer.
 * Imports RngSource type-only from src/protocol/types.ts.
 */

import type { RngSource } from '../protocol/types.js';

export type { RngSource };

export interface LockOptions {
  /** Injectable RNG (default: crypto.getRandomValues-based). */
  rng?: RngSource;
  /** Iteration count for PBKDF2 (default: 310,000; test only). */
  iterations?: number;
}

export interface UnlockOptions {
  /** Iteration count for PBKDF2 (default: 310,000; test only). */
  iterations?: number;
}

export type LockResult =
  | { ok: true; ciphertext: Uint8Array; encSalt: Uint8Array; iv: Uint8Array }
  | { ok: false; error: 'empty-passphrase' | 'lock-failed' };

export type UnlockResult =
  | { ok: true; plaintext: Uint8Array }
  | { ok: false; error: 'wrong-passphrase' };
