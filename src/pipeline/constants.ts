/**
 * Cryptographic constants for PBKDF2-SHA-256 and AES-GCM.
 */

// PBKDF2-SHA-256 configuration
export const PBKDF2_ITERATIONS = 310_000;
export const PBKDF2_SALT_LEN = 16; // bytes
export const PBKDF2_KEY_LEN = 32; // bytes for AES-256

// AES-GCM configuration
export const AES_GCM_IV_LEN = 12; // bytes (nonce for GCM mode)
export const AES_GCM_TAG_LEN = 16; // bytes (appended to ciphertext)
