/**
 * Unlock AES-GCM ciphertext using a passphrase.
 * Derives the key from the passphrase, salt, and iteration count.
 *
 * Returns plaintext on success or 'wrong-passphrase' on any error
 * (wrong key, tampered ciphertext, tampered salt/IV, etc.).
 * Never throws; all errors are values.
 */

import { PBKDF2_ITERATIONS, PBKDF2_SALT_LEN, AES_GCM_IV_LEN } from './constants.js';
import { normalisePassphrase } from './passphrase.js';
import { deriveKey } from './derive-key.js';
import type { UnlockOptions, UnlockResult } from './types.js';

/**
 * Decrypt AES-GCM ciphertext using a passphrase.
 * Derives the key from the passphrase, salt, and iteration count.
 *
 * Returns plaintext on success or 'wrong-passphrase' on any error
 * (wrong key, tampered ciphertext, tampered salt/IV, etc.).
 * Never throws; all errors are values.
 */
export async function unlock(
  ciphertext: Uint8Array,
  passphrase: string,
  encSalt: Uint8Array,
  iv: Uint8Array,
  options?: UnlockOptions,
): Promise<UnlockResult> {
  try {
    // Validate salt and IV lengths early
    if (encSalt.length !== PBKDF2_SALT_LEN) {
      return { ok: false, error: 'wrong-passphrase' };
    }
    if (iv.length !== AES_GCM_IV_LEN) {
      return { ok: false, error: 'wrong-passphrase' };
    }

    const normalised = normalisePassphrase(passphrase);

    const iterations = options?.iterations ?? PBKDF2_ITERATIONS;

    const derivedKey = await deriveKey(normalised, encSalt, iterations);

    // Copy ciphertext and IV to ensure BufferSource compliance
    const ciphertextCopy = new Uint8Array(ciphertext);
    const ivCopy = new Uint8Array(iv);

    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivCopy },
      derivedKey,
      ciphertextCopy,
    );

    return { ok: true, plaintext: new Uint8Array(plaintext) };
  } catch {
    // Catch all errors (AES-GCM tag verification failure, wrong key, etc.)
    // and return 'wrong-passphrase' without exposing the error
    return { ok: false, error: 'wrong-passphrase' };
  }
}
