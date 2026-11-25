# Design Document — Crypto Layer (`src/pipeline/`)

## Overview

The crypto layer encrypts and decrypts Wail message payloads using PBKDF2-SHA-256 key derivation and AES-GCM-256 authenticated encryption. It is pure TypeScript: no DOM, no Web Audio, no IndexedDB. Every module runs in Node and is fully testable without a browser.

The layer's responsibilities:

1. **Passphrase normalisation** — NFC normalisation and whitespace trimming so users who speak the passphrase can type it on different devices and get the same key.
2. **PBKDF2-SHA-256 key derivation** — Stretch the normalised passphrase with 310,000 iterations (configurable for tests) to produce a 32-byte AES-256 key.
3. **Random salt and IV generation** — Generate fresh 16-byte salt and 12-byte IV per message using injectable RNG or the system CSPRNG.
4. **AES-GCM-256 encryption** — Encrypt plaintext with the derived key, producing ciphertext with the 16-byte authentication tag appended.
5. **AES-GCM-256 decryption** — Decrypt ciphertext; return plaintext on success or `{ ok: false, error: 'wrong-passphrase' }` on any failure without exposing internal errors.
6. **Lock and unlock API** — Async functions that never throw for bad input; all errors are values.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     src/pipeline/                         │
│                                                           │
│  constants.ts     PBKDF2_ITERATIONS=310000               │
│                   PBKDF2_SALT_LEN=16                      │
│                   PBKDF2_KEY_LEN=32                       │
│                   AES_GCM_IV_LEN=12                       │
│                   AES_GCM_TAG_LEN=16                      │
│                                                           │
│  types.ts         RngSource, LockOptions,                │
│                   UnlockOptions, LockResult,             │
│                   UnlockResult                           │
│                                                           │
│  passphrase.ts    normalisePassphrase(str) → string      │
│  derive-key.ts    deriveKey(pass, salt, iters) →        │
│                      Promise<CryptoKey>                  │
│                   (also deriveBits for RFC 6070 test)    │
│  lock.ts          lock(plain, pass, opts?) →            │
│                      Promise<LockResult>                 │
│  unlock.ts        unlock(cipher, pass, salt, iv, opts?)│
│                      → Promise<UnlockResult>             │
│                                                           │
│  index.ts         public API barrel                       │
└───────────────────────────────────────────────────────────┘
         ↓ used by
  src/app/        (message service)
```

**Dependency rule**: `src/pipeline/` imports nothing outside itself except (type-only) from `src/protocol/types.ts` for `RngSource`. It is a leaf layer.

### Component interaction

```
lock(plaintext, passphrase, options?)
  ├─ normalisePassphrase(passphrase)
  ├─ validate (not empty)
  ├─ generate random salt via rng() (16 bytes)
  ├─ generate random iv via rng() (12 bytes)
  ├─ deriveKey(normalized, salt, iterations)
  ├─ encrypt via crypto.subtle.encrypt('AES-GCM', key, plaintext, iv)
  └─ return { ok: true, ciphertext, encSalt, iv }

unlock(ciphertext, passphrase, encSalt, iv, options?)
  ├─ normalisePassphrase(passphrase)
  ├─ validate salt is 16 bytes, iv is 12 bytes
  ├─ deriveKey(normalized, encSalt, iterations)
  ├─ try crypto.subtle.decrypt('AES-GCM', key, ciphertext, iv)
  ├─ catch all errors → return { ok: false, error: 'wrong-passphrase' }
  └─ return { ok: true, plaintext }
```

---

## Components and Interfaces

### `src/pipeline/constants.ts`

```ts
// PBKDF2 configuration
export const PBKDF2_ITERATIONS = 310_000;
export const PBKDF2_SALT_LEN = 16; // bytes
export const PBKDF2_KEY_LEN = 32; // bytes for AES-256

// AES-GCM configuration
export const AES_GCM_IV_LEN = 12; // bytes (nonce for GCM mode)
export const AES_GCM_TAG_LEN = 16; // bytes (appended to ciphertext)
```

**Usage note**: Only `PBKDF2_ITERATIONS` and `PBKDF2_SALT_LEN` are exported for import by test files. The others are internal to the crypto layer.

---

### `src/pipeline/types.ts`

```ts
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
  | { ok: false; error: 'empty-passphrase' };

export type UnlockResult =
  | { ok: true; plaintext: Uint8Array }
  | { ok: false; error: 'wrong-passphrase' };
```

---

### `src/pipeline/passphrase.ts`

```ts
/**
 * Normalise a passphrase to Unicode NFC and trim leading/trailing whitespace.
 * Returns the normalised passphrase, which may be empty (the caller's responsibility
 * to validate).
 */
export function normalisePassphrase(passphrase: string): string {
  return passphrase.normalize('NFC').trim();
}
```

**Algorithm**:
1. Apply `passphrase.normalize('NFC')` (Unicode Normal Form C).
2. Apply `.trim()` to remove leading and trailing whitespace.
3. Return the result (may be an empty string).

**Example usage in lock and unlock**: Both functions call this once and check if the result is empty before proceeding.

---

### `src/pipeline/derive-key.ts`

```ts
/**
 * Derive a 32-byte AES-256 key from a normalised passphrase using PBKDF2-SHA-256.
 * Returns a non-extractable CryptoKey suitable for AES-GCM encryption/decryption.
 */
export async function deriveKey(
  normalisedPassphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey>;

/**
 * Derive raw key bits for RFC 6070 test vector validation.
 * This function is used only in tests to compare against known-answer vectors.
 * Not exported from index.ts (test-only).
 */
export async function deriveBits(
  normalisedPassphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array>;
```

#### Implementation — `deriveKey`

1. Convert `normalisedPassphrase` to a `Uint8Array` via `new TextEncoder().encode()`.
2. Import the passphrase as a `CryptoKey` using `crypto.subtle.importKey('raw', passphraseBytes, { name: 'PBKDF2' }, false, ['deriveKey'])`.
3. Call `crypto.subtle.deriveKey({ name: 'PBKDF2', salt, hash: 'SHA-256', iterations }, passphraseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])`.
4. Return the resulting `CryptoKey` (non-extractable by default).

**Non-extractable property**: The derived key cannot be exported from the CryptoKey object, so it is never exposed in memory. This is a security best practice enforced by the Web Crypto API.

#### Implementation — `deriveBits` (test-only)

Same as `deriveKey` but uses `crypto.subtle.deriveBits` instead of `deriveKey` and returns the raw 32-byte `Uint8Array`. This function is not exported from `index.ts` but is used only in the RFC 6070 test.

---

### `src/pipeline/lock.ts`

```ts
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
  options?: LockOptions
): Promise<LockResult>;
```

#### Algorithm

1. Normalise and trim the passphrase using `normalisePassphrase(passphrase)`.
2. If the result is an empty string, return `{ ok: false, error: 'empty-passphrase' }` immediately.
3. Generate `encSalt` (16 bytes) using `rng()` from options or `crypto.getRandomValues()`.
4. Generate `iv` (12 bytes) using the same RNG source.
5. Get `iterations` from `options.iterations` (default `PBKDF2_ITERATIONS`).
6. Call `deriveKey(normalisedPassphrase, encSalt, iterations)` and await the result. If this throws, catch and return `{ ok: false, error: 'wrong-passphrase' }` (should not happen in normal operation, but be defensive).
7. Call `crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, plaintext)` and await the result.
8. Catch any error from the encrypt call, return `{ ok: false, error: 'wrong-passphrase' }` (defensive; should not throw in production).
9. Return `{ ok: true, ciphertext, encSalt, iv }`.

**RNG generation helper**: Create a small helper function `generateRandomBytes(len: number, rng?: RngSource): Uint8Array` that fills a buffer of `len` bytes by calling `rng()` for each byte or `crypto.getRandomValues()` if no RNG is provided.

---

### `src/pipeline/unlock.ts`

```ts
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
  options?: UnlockOptions
): Promise<UnlockResult>;
```

#### Algorithm

1. Validate that `encSalt.length === 16`. If not, return `{ ok: false, error: 'wrong-passphrase' }` (must be checked before calling `deriveKey` to avoid exposing size mismatches as a different error).
2. Validate that `iv.length === 12`. If not, return `{ ok: false, error: 'wrong-passphrase' }`.
3. Normalise and trim the passphrase using `normalisePassphrase(passphrase)`.
4. Wrap all subsequent operations in a try-catch block.
5. Get `iterations` from `options.iterations` (default `PBKDF2_ITERATIONS`).
6. Call `deriveKey(normalisedPassphrase, encSalt, iterations)` and await the result.
7. Call `crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, ciphertext)` and await the result.
8. Return `{ ok: true, plaintext }` (returned as a new `Uint8Array` to avoid exposing the backing buffer).
9. Catch any error (including AES-GCM tag verification failure, wrong key, wrong nonce, or wrong salt) and return `{ ok: false, error: 'wrong-passphrase' }` **without logging or exposing the error message**.

**Catch-all approach**: All exceptions (SubtleCrypto errors, type errors, etc.) map to `'wrong-passphrase'`. This prevents the caller from inferring whether the user mistyped the passphrase or someone tampered with the ciphertext/salt/iv.

---

### `src/pipeline/index.ts`

Barrel that re-exports only the public surface:

```ts
export { lock } from './lock.js';
export { unlock } from './unlock.js';
export { normalisePassphrase } from './passphrase.js';

export type { LockOptions, UnlockOptions, LockResult, UnlockResult, RngSource } from './types.js';
```

> `deriveBits` is NOT exported (test-only). Tests import it directly from `derive-key.ts`.

---

## Data Models

### Wire format (no serialisation in this layer)

The crypto layer operates on raw `Uint8Array` for plaintext and ciphertext. The manifest serialiser (in `src/protocol/manifest.ts`) embeds `encSalt` and `iv` as fixed 16 and 12-byte fields in the manifest body.

**Ciphertext format**: plaintext concatenated with the 16-byte AES-GCM authentication tag. Total length: `plaintext.length + 16` bytes. The tag is verified automatically on decryption by the Web Crypto API.

---

## Correctness Properties

### Property P5: Round-trip and passphrase sensitivity (R2, R3, R4, R5, R6, R8)

**What it covers:** Lock then unlock with the same passphrase returns the plaintext; any different passphrase or tampered data fails.

#### Sub-properties

1. **P5a — Identity (R2):** FOR ALL plaintexts of 0 to 2,048 bytes and all passphrases, `unlock(lock(plaintext, passphrase, { rng, iterations: 1000 }).ciphertext, passphrase, salt, iv, { iterations: 1000 }).plaintext == plaintext` (round-trip identity; determinism given the same salt/IV/iterations).

2. **P5b — Passphrase sensitivity (R6):** FOR ALL plaintexts, passphrases and reference passphrases that differ in at least one character after normalisation and trimming, `unlock(lock(plaintext, passphrase, { iterations: 1000 }).ciphertext, differentPassphrase, salt, iv, { iterations: 1000 }).ok == false` (AES-GCM tag rejects wrong key).

3. **P5c — Passphrase normalisation equivalence (R1):** FOR ALL plaintexts and two passphrases `p1` and `p2` where `p1.normalize('NFC').trim() === p2.normalize('NFC').trim()`, `lock(plaintext, p1) | unlock(..., p2)` and `lock(plaintext, p2) | unlock(..., p1)` both succeed and return the same plaintext (NFC equivalence and whitespace trimming).

4. **P5d — Empty passphrase rejection (R1):** FOR ALL plaintexts and passphrases that become empty after NFC normalisation and trimming, `lock(plaintext, passphrase)` returns `{ ok: false, error: 'empty-passphrase' }` and no encryption is performed.

5. **P5e — Salt sensitivity (R2):** FOR ALL plaintexts, passphrases and two different salts `salt1 ≠ salt2`, the ciphertexts produced by PBKDF2 with `salt1` and `salt2` are different. When unlock is attempted with `salt1` but the ciphertext was encrypted with `salt2`, the result SHALL be `{ ok: false, error: 'wrong-passphrase' }`.

6. **P5f — IV sensitivity (R4):** FOR ALL plaintexts, passphrases and two different IVs `iv1 ≠ iv2`, when AES-GCM decryption is attempted with the wrong IV, the AES-GCM tag SHALL fail to verify and the result SHALL be `{ ok: false, error: 'wrong-passphrase' }`.

7. **P5g — Bit-flip detection (R4):** FOR ALL ciphertexts produced by lock, flipping any single bit anywhere in the ciphertext, `enc_salt` or `iv` SHALL cause unlock to return `{ ok: false, error: 'wrong-passphrase' }` (AES-GCM authentication).

8. **P5h — Fresh randomness (R3):** FOR ALL plaintexts and passphrases, calling lock twice with the same inputs but no injected RNG (using the system CSPRNG) SHALL produce different ciphertexts due to different salts and IVs (two-ciphertexts property).

9. **P5i — Determinism (R2):** FOR ALL plaintexts, passphrases, salts, IVs, and iteration counts, calling lock and unlock with the same inputs (injected RNG seed for reproducibility) produces the same result every time (determinism under fixed input).

#### Test file locations

- `tests/pipeline/R2.lock-round-trip.prop.test.ts` — covers P5a, P5b, P5c, P5d with 1,000 runs; plaintext sizes 0, 1, 10, 100, 1,000, 2,048; passphrase types (empty → rejected, ASCII, Unicode, whitespace, NFC-equivalent forms).
- `tests/pipeline/R2.bit-flip-detection.prop.test.ts` — covers P5e, P5f, P5g, testing that any single bit flip in ciphertext/salt/iv breaks decrypt, with 1,000 runs; plaintext 50–200 bytes, passphrase ASCII + Unicode mix.
- `tests/pipeline/R2.fresh-randomness.prop.test.ts` — covers P5h, calling lock 10 times with the same input, using the default CSPRNG (no injected RNG), with iterations 1,000, and verifying all 10 ciphertexts differ, 1,000 runs.
- `tests/pipeline/R2.real-iterations.prop.test.ts` — executes lock and unlock with the actual 310,000 iterations (not reduced for speed); 2 runs; plaintext 100 bytes, passphrase 10–20 characters. Verifies that the real iteration count is used in production and that the performance is acceptable.

---

## Error Handling

| Error condition | Where caught | Caller receives |
|---|---|---|
| Passphrase empty after NFC + trim | `lock` | `{ ok: false, error: 'empty-passphrase' }` |
| encSalt length ≠ 16 | `unlock` (before deriveKey) | `{ ok: false, error: 'wrong-passphrase' }` |
| iv length ≠ 12 | `unlock` (before decrypt) | `{ ok: false, error: 'wrong-passphrase' }` |
| Wrong passphrase (key mismatch) | `unlock` (AES-GCM tag verify) | `{ ok: false, error: 'wrong-passphrase' }` |
| Tampered ciphertext | `unlock` (AES-GCM tag verify) | `{ ok: false, error: 'wrong-passphrase' }` |
| Tampered encSalt | `unlock` (derived key mismatch) | `{ ok: false, error: 'wrong-passphrase' }` |
| Tampered iv | `unlock` (AES-GCM tag verify) | `{ ok: false, error: 'wrong-passphrase' }` |
| Any other crypto exception | `unlock` (catch-all) | `{ ok: false, error: 'wrong-passphrase' }` |

**Principle**: errors are values, never exceptions. The module never throws for invalid input (after passphrase normalisation). Exceptions from JavaScript internals bubble up and are the caller's responsibility (defensive programming).

---

## Testing Strategy

### Library

**fast-check** (already in devDependencies) for all property-based tests. **Vitest** as the test runner.

### No new runtime dependencies

The crypto layer uses only `globalThis.crypto.subtle` (Web Crypto API, available in Node 22 and all modern browsers) and the TextEncoder built-in. No external cryptography library is added.

### Property test plan

Each test file runs a minimum of **1,000 iterations** (`{ numRuns: 1000 }`), except the real-iteration test which runs **2 times** to verify performance is acceptable.

| File | Properties covered | Requirement IDs | Key arbitraries |
|---|---|---|---|
| `tests/pipeline/R2.lock-round-trip.prop.test.ts` | P5a, P5b, P5c, P5d | R1, R2, R4, R5 | `fc.uint8Array({ minLength: 0, maxLength: 2048 })` for plaintext; `fc.string().map(s => s.normalize('NFC'))` or manual NFC generation; empty-string test; deterministic RNG |
| `tests/pipeline/R2.bit-flip-detection.prop.test.ts` | P5e, P5f, P5g | R2, R3, R4 | Valid lock result; `fc.integer` for bit position; `fc.integer({ min: 0, max: 255 })` for XOR mask |
| `tests/pipeline/R2.fresh-randomness.prop.test.ts` | P5h | R3 | Same plaintext and passphrase, call lock 10 times, verify all ciphertexts differ; `numRuns: 1000` |
| `tests/pipeline/R2.real-iterations.prop.test.ts` | P5i (determinism) + performance | R2 | Plaintext 100 bytes, passphrase 10–20 chars, iterations 310,000; `numRuns: 2` |

### Unit tests (example-based)

All example-based unit tests live in a single file: **`tests/pipeline/pipeline.test.ts`**. This file covers:

- **Known-answer test (RFC 6070 / RFC 7914)**: Derive a key with PBKDF2-SHA-256 for passphrase `'password'`, salt `'salt'` (ASCII bytes), 1 iteration, and compare the first 32 bytes of the raw derived bits with the reference vector `120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b` (hex). This validates that the crypto.subtle PBKDF2 implementation matches the standard.
- Passphrase normalisation: `'café'` (precomposed) and `'cafe\u0301'` (decomposed) produce the same derived key after normalisation.
- Empty passphrase: `lock(plaintext, '')` and `lock(plaintext, '   ')` both return `{ ok: false, error: 'empty-passphrase' }`.
- Round-trip with known-good inputs: plaintext 50 bytes, passphrase `'test-pass'`, deterministic salt/IV.
- Tampered ciphertext: flip one byte and verify unlock returns `'wrong-passphrase'`.
- Determinism: same inputs (including injected RNG seed) produce the same ciphertext.

---

## Non-Goals

This spec covers `src/pipeline/` crypto functions only. The following are explicitly out of scope:

- **Card serialisation** (`04-cards` spec): Not the responsibility of the crypto layer.
- **Compression** (`src/pipeline/`): That is a separate spec module.
- **Manifest serialisation** (`src/protocol/manifest.ts`): The protocol layer embeds `encSalt` and `iv` in the manifest body; the crypto layer only produces them.
- **Broadcast carousel** (`05-broadcast` spec): The crypto layer produces one locked frame; repetition is the caller's concern.
- **UI** (`src/ui/`): Zero references to Preact or DOM.
- **Audio I/O** (`src/audio/`): Zero references to Web Audio API.
- **IndexedDB** (`src/store/`): No persistence.
