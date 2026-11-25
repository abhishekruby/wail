/**
 * Lock plaintext with a passphrase using PBKDF2-SHA-256 and AES-GCM-256.
 * Generates fresh salt and IV per message.
 * Never throws; all errors are values.
 */

import { PBKDF2_ITERATIONS, AES_GCM_IV_LEN, PBKDF2_SALT_LEN } from './constants.js';
import { normalisePassphrase } from './passphrase.js';
import { deriveKey } from './derive-key.js';
import type { LockOptions, LockResult } from './types.js';
import type { RngSource } from '../protocol/types.js';

/**
 * Generate random bytes using an injectable RNG or the system CSPRNG.
 */
function generateRandomBytes(len: number, rng?: RngSource): Uint8Array {
  const buffer = new Uint8Array(len);
  if (rng) {
    for (let i = 0; i < len; i++) {
      buffer[i]! = rng() & 0xff;
    }
  } else {
    globalThis.crypto.getRandomValues(buffer);
  }
  return buffer;
}

/**
 * Encrypt plaintext with a passphrase using PBKDF2-SHA-256 key derivation
 * and AES-GCM-256 authenticated encryption.
 *
 * Generates fresh salt and IV per message.
 * Never throws; all errors are values.
 */
export async function lock(
  plaintext: Uint8Array,
  passphrase: string,
  options?: LockOptions,
): Promise<LockResult> {
  try {
    const normalised = normalisePassphrase(passphrase);

    if (normalised === '') {
      return { ok: false, error: 'empty-passphrase' };
    }

    const encSalt = generateRandomBytes(PBKDF2_SALT_LEN, options?.rng);
    const iv = generateRandomBytes(AES_GCM_IV_LEN, options?.rng);
    const iterations = options?.iterations ?? PBKDF2_ITERATIONS;

    const derivedKey = await deriveKey(normalised, encSalt, iterations);

    // Copy plaintext and IV to ensure BufferSource compliance
    const plaintextCopy = new Uint8Array(plaintext);
    const ivCopy = new Uint8Array(iv);

    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivCopy },
      derivedKey,
      plaintextCopy,
    );

    return {
      ok: true,
      ciphertext: new Uint8Array(ciphertext),
      encSalt,
      iv,
    };
  } catch {
    // Defensive: any error during encryption returns lock-failed
    return { ok: false, error: 'lock-failed' };
  }
}
