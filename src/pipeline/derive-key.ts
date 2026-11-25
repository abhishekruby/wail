/**
 * Derive cryptographic keys from a normalised passphrase using PBKDF2-SHA-256.
 * Provides both CryptoKey (for use in encrypt/decrypt) and raw bits (for testing).
 */

import { PBKDF2_KEY_LEN } from './constants.js';

/**
 * Derive a 32-byte AES-256 key from a normalised passphrase using PBKDF2-SHA-256.
 * Returns a non-extractable CryptoKey suitable for AES-GCM encryption/decryption.
 */
export async function deriveKey(
  normalisedPassphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(normalisedPassphrase);
  // Copy to Uint8Array to ensure BufferSource compliance
  const saltCopy = new Uint8Array(salt);

  const passphraseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      hash: 'SHA-256',
      iterations,
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );

  return derivedKey;
}

/**
 * Derive raw key bits for RFC 6070 test vector validation.
 * This function is used only in tests to compare against known-answer vectors.
 * Not exported from index.ts (test-only).
 */
export async function deriveBits(
  normalisedPassphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const passphraseBytes = new TextEncoder().encode(normalisedPassphrase);
  // Copy to Uint8Array to ensure BufferSource compliance
  const saltCopy = new Uint8Array(salt);

  const passphraseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      hash: 'SHA-256',
      iterations,
    },
    passphraseKey,
    PBKDF2_KEY_LEN * 8, // bits (32 bytes = 256 bits)
  );

  return new Uint8Array(bits);
}
