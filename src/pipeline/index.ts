/**
 * Public API barrel export for the crypto layer.
 */

export { lock } from './lock.js';
export { unlock } from './unlock.js';
export { normalisePassphrase } from './passphrase.js';

export type { LockOptions, UnlockOptions, LockResult, UnlockResult, RngSource } from './types.js';
