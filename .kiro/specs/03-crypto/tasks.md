# Implementation Plan: Crypto Layer (`src/pipeline/`)

## Overview

Implements the pure-TypeScript crypto layer: passphrase normalisation, PBKDF2-SHA-256 key derivation, AES-GCM-256 encryption/decryption, lock and unlock functions. Every module is a leaf — no DOM, Web Audio, or IndexedDB. Tests run entirely in Node via Vitest + fast-check.

## Tasks

- [x] 1. Create `src/pipeline/constants.ts` and `src/pipeline/types.ts`
  - Export constants from `constants.ts`: `PBKDF2_ITERATIONS = 310_000`, `PBKDF2_SALT_LEN = 16`, `PBKDF2_KEY_LEN = 32`, `AES_GCM_IV_LEN = 12`, `AES_GCM_TAG_LEN = 16`
  - Define all shared TypeScript interfaces and type aliases in `types.ts`: `LockOptions`, `UnlockOptions`, `LockResult`, `UnlockResult`; import `RngSource` type-only from `src/protocol/types.js`
  - `types.ts` imports only from `constants.ts` and `src/protocol/types.ts` (type-only); neither file imports other runtime code
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [x] 2. Implement passphrase normalisation
  - [x] 2.1 Create `src/pipeline/passphrase.ts`
    - Implement `normalisePassphrase(passphrase: string): string` using `passphrase.normalize('NFC').trim()`
    - Returns the result (may be empty); the caller validates
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Implement PBKDF2 key derivation
  - [x] 3.1 Create `src/pipeline/derive-key.ts`
    - Implement `deriveKey(normalisedPassphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>`
      - Convert passphrase to bytes via `new TextEncoder().encode()`
      - Import as CryptoKey: `crypto.subtle.importKey('raw', passphraseBytes, { name: 'PBKDF2' }, false, ['deriveKey'])`
      - Derive key: `crypto.subtle.deriveKey({ name: 'PBKDF2', salt, hash: 'SHA-256', iterations }, passphraseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])`
      - Return the non-extractable CryptoKey
      - Wrap in try-catch; never throw (errors are caught by caller)
    - Implement `deriveBits(normalisedPassphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>` (test-only, not exported from index)
      - Same as `deriveKey` but uses `crypto.subtle.deriveBits` and returns the raw 32-byte `Uint8Array`
      - Used only in the RFC 6070 known-answer test
    - _Requirements: 2.1, 2.2, 2.3, 8.1_

- [x] 4. Implement lock function
  - [x] 4.1 Create `src/pipeline/lock.ts`
    - Implement `lock(plaintext: Uint8Array, passphrase: string, options?: LockOptions): Promise<LockResult>`
    - Normalise passphrase: `const normalised = normalisePassphrase(passphrase)`
    - If `normalised === ''`, return `{ ok: false, error: 'empty-passphrase' }` immediately
    - Generate `encSalt` (16 bytes) via `generateRandomBytes(16, options?.rng)` helper
    - Generate `iv` (12 bytes) via `generateRandomBytes(12, options?.rng)`
    - Get iterations from `options?.iterations ?? PBKDF2_ITERATIONS`
    - Wrap in try-catch:
      - Call `deriveKey(normalised, encSalt, iterations)` and await
      - Call `crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, plaintext)` and await
      - Return `{ ok: true, ciphertext, encSalt, iv }`
      - Catch any error, return `{ ok: false, error: 'empty-passphrase' }` (should not happen, defensive)
    - Create helper `generateRandomBytes(len: number, rng?: RngSource): Uint8Array`
      - If `rng` is provided, call it `len` times and fill buffer
      - Otherwise, use `crypto.getRandomValues(buffer)`
    - _Requirements: 1.1, 1.3, 3.1, 3.3, 4.1, 5.1, 7.1_

  - [x] 4.2 Write property test `tests/pipeline/R6.lock-round-trip.prop.test.ts`
    - **Property P5a, P5b, P5c, P5d — Round-trip and passphrase sensitivity** — lock then unlock with the same passphrase returns the plaintext; different passphrases or normalized equivalents behave correctly; empty passphrases are rejected
    - Arbitraries: `fc.uint8Array({ minLength: 0, maxLength: 2048 })` for plaintext; `fc.string()` for passphrase (including empty strings, whitespace-only, Unicode, NFC-equivalent pairs); deterministic RNG seeded via `fc.integer`
    - Test corpus: plaintext sizes 0, 1, 10, 100, 1000, 2048 bytes; passphrase types (ASCII, Unicode, whitespace, normalized equivalents); iterations 1,000 for speed
    - Verify: `lock(plaintext, pass1) | unlock(..., pass1)` succeeds; `lock(plaintext, pass1) | unlock(..., pass2)` where normalized forms differ fails; `lock(plaintext, pass1) | unlock(..., pass2)` where normalized forms match succeeds; empty passphrases return `'empty-passphrase'`
    - `numRuns: 1000`
    - **Validates: Requirements 1.1, 1.5, 2.1, 2.3, 4.5, 5.1, 5.6, 6.1_

  - [x] 4.3 Write property test `tests/pipeline/R7.bit-flip-detection.prop.test.ts`
    - **Property P5e, P5f, P5g — Salt/IV sensitivity and bit-flip detection** — wrong salt/IV or bit-flipped ciphertext causes unlock to fail
    - Arbitraries: generate a valid lock result with deterministic RNG; `fc.integer` for bit position within ciphertext, salt, or IV; `fc.integer({ min: 1, max: 255 })` for XOR mask (non-zero)
    - Test: flip the selected bit in ciphertext/salt/iv and verify `unlock` returns `'wrong-passphrase'`
    - `numRuns: 1000`
    - **Validates: Requirements 2.2, 3.1, 4.6, 6.2_

- [x] 5. Implement unlock function
  - [x] 5.1 Create `src/pipeline/unlock.ts`
    - Implement `unlock(ciphertext: Uint8Array, passphrase: string, encSalt: Uint8Array, iv: Uint8Array, options?: UnlockOptions): Promise<UnlockResult>`
    - Validate `encSalt.length === 16` before deriving; if not, return `{ ok: false, error: 'wrong-passphrase' }`
    - Validate `iv.length === 12`; if not, return `{ ok: false, error: 'wrong-passphrase' }`
    - Normalise passphrase: `const normalised = normalisePassphrase(passphrase)`
    - Wrap all subsequent operations in try-catch:
      - Get iterations from `options?.iterations ?? PBKDF2_ITERATIONS`
      - Call `deriveKey(normalised, encSalt, iterations)` and await
      - Call `crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, ciphertext)` and await
      - Return `{ ok: true, plaintext }` (as new Uint8Array to avoid exposing backing buffer)
      - Catch any error (AES-GCM tag verify fail, SubtleCrypto exception, type error) and return `{ ok: false, error: 'wrong-passphrase' }` **without logging or exposing the error**
    - _Requirements: 1.1, 1.4, 4.4, 4.6, 5.3, 6.3, 7.1, 7.2_

  - [x] 5.2 Write property test `tests/pipeline/R6.fresh-randomness.prop.test.ts`
    - **Property P5h — Fresh randomness** — calling lock twice with the same inputs but no injected RNG produces different ciphertexts
    - Arbitraries: `fc.uint8Array({ minLength: 10, maxLength: 100 })` for plaintext; `fc.string({ minLength: 1 }).map(s => normalisePassphrase(s)).filter(s => s.length > 0)` for passphrase
    - Test: call `lock(plaintext, passphrase, { iterations: 1000 })` 10 times with no injected RNG (uses system CSPRNG), collect all ciphertexts, verify they are all distinct (not equal to any other)
    - `numRuns: 200`
    - **Validates: Requirements 3.1, 3.3_

- [x] 6. Create barrel `src/pipeline/index.ts`
  - Re-export the full public API surface: `lock`, `unlock`, `normalisePassphrase`
  - Re-export all types from `types.ts`: `LockOptions`, `UnlockOptions`, `LockResult`, `UnlockResult`, `RngSource`
  - Do NOT export `deriveBits` (test-only; tests import directly from derive-key.ts)
  - Do NOT export constants (test files import directly from constants.ts if needed)
  - No implementation logic in this file
  - _Requirements: 1.1, 5.1_

- [x] 7. Write unit tests `tests/pipeline/pipeline.test.ts`
  - [x] 7.1 Write known-answer test (RFC 6070 / RFC 7914 vector)
    - Import `deriveBits` directly from `src/pipeline/derive-key.ts`
    - Test vector: passphrase `'password'` (ASCII), salt `'salt'` (ASCII bytes), 1 iteration
    - Derive bits and compare first 32 bytes (hex) with reference `120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b`
    - Validates that `crypto.subtle.deriveBits` with PBKDF2-SHA-256 matches the standard
    - _Requirements: 2.1, 2.3, 8.1_

  - [x] 7.2 Write passphrase normalisation tests
    - Verify `normalisePassphrase('  test  ')` equals `'test'`
    - Verify `normalisePassphrase('café')` (precomposed U+00E9) equals `normalisePassphrase('cafe\u0301')` (decomposed e + combining acute)
    - Verify `normalisePassphrase('')` equals `''`
    - Verify `normalisePassphrase('   ')` equals `''`
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 7.3 Write empty passphrase tests
    - Verify `lock(plaintext, '')` returns `{ ok: false, error: 'empty-passphrase' }`
    - Verify `lock(plaintext, '   ')` returns `{ ok: false, error: 'empty-passphrase' }` (whitespace only)
    - Verify `lock(plaintext, '\u00AD')` where the input is a soft hyphen (a whitespace-like character that normalizes away) returns the error
    - _Requirements: 1.1, 1.3_

  - [x] 7.4 Write round-trip tests
    - Deterministic RNG (all bytes = 0 for reproducibility):
      - Plaintext: `Uint8Array.from([1, 2, 3, 4, 5])`
      - Passphrase: `'test-pass'`
      - lock → unlock with same passphrase returns exact plaintext
      - Verify ciphertext is exactly 5 + 16 = 21 bytes (plaintext + tag)
      - Verify `encSalt.length === 16` and `iv.length === 12`
    - _Requirements: 4.1, 4.5, 5.1, 5.5, 6.1_

  - [x] 7.5 Write tampered ciphertext tests
    - Deterministic lock with known-good plaintext/passphrase/salt/iv
    - Flip one byte at position 0 of ciphertext and verify `unlock` returns `{ ok: false, error: 'wrong-passphrase' }`
    - Flip one byte in `encSalt` and verify same result
    - Flip one byte in `iv` and verify same result
    - _Requirements: 4.6, 6.2_

  - [x] 7.6 Write wrong-passphrase tests
    - Lock with passphrase `'correct'`
    - Unlock with passphrase `'wrong'` and verify `{ ok: false, error: 'wrong-passphrase' }`
    - Unlock with passphrase `'CORRECT'` (case-sensitive) and verify same result
    - _Requirements: 1.5, 4.6, 6.1_

  - [x] 7.7 Write size-validation tests
    - Unlock with `encSalt.length !== 16` and verify `{ ok: false, error: 'wrong-passphrase' }` (before deriving key)
    - Unlock with `iv.length !== 12` and verify same result
    - _Requirements: 4.6, 6.2_

- [x] 8. Write property test `tests/pipeline/R6.real-iterations.prop.test.ts`
  - Executes `lock` and `unlock` with the actual 310,000 iterations (not reduced for speed)
  - Arbitraries: plaintext 100 bytes, passphrase 10–20 characters (ASCII)
  - Deterministic RNG (zero seed)
  - Verify round-trip succeeds
  - Performance check: total time for lock + unlock should be acceptable (< 5s for 2 runs on a typical machine)
  - `numRuns: 2` (small because iterations are real and slow)
  - **Validates: Requirements 2.1, 2.3_

- [x] 9. Final checkpoint — Ensure all tests pass

## Notes

- **CORRECTED test names** (R6/R7 requirement IDs used instead of R2):
  - `tests/pipeline/R6.lock-round-trip.prop.test.ts` — covers P5a, P5b, P5c, P5d
  - `tests/pipeline/R7.bit-flip-detection.prop.test.ts` — covers P5e, P5f, P5g
  - `tests/pipeline/R6.fresh-randomness.prop.test.ts` — covers P5h
  - `tests/pipeline/R6.real-iterations.prop.test.ts` — real 310,000 iterations for performance verification
- **Corrected LockResult error union**: `'empty-passphrase' | 'lock-failed'` (lock returns 'lock-failed' if any crypto.subtle call throws)
- **Property tests are required** (removed '*' marker): all property tests must use `fc.asyncProperty` with `await fc.assert(...)` inside async it callbacks
- All property tests use **1000 numRuns** except fresh-randomness (200) and real-iterations (2)
- Each task references specific requirements for traceability; `Rn.m` refers to Requirement n, criterion m in `requirements.md`
- All property tests use a deterministic RNG injected via `LockOptions.rng` — no random input is left to chance in reproducibility
- The crypto layer uses only `globalThis.crypto.subtle` (Web Crypto API, available in Node 22) and built-in `TextEncoder`. No external crypto dependencies are added.
- `src/pipeline/constants.ts` holds the PBKDF2 and AES-GCM configuration constants; test files import these directly if they need to override (e.g. `PBKDF2_ITERATIONS` for fast testing).
- `src/pipeline/types.ts` imports `RngSource` type-only from `src/protocol/types.js` to avoid a runtime import of protocol code.
- The barrel `index.ts` re-exports from `types.ts` and function modules; callers that only need types can import directly from `src/pipeline/types.js`
- `deriveBits` is test-only and NOT exported from index.ts; tests import it directly from derive-key.ts for RFC 6070 known-answer testing.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["6"] },
    { "id": 7, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7"] },
    { "id": 8, "tasks": ["8"] },
    { "id": 9, "tasks": ["9"] }
  ]
}
```

## Implementation Notes

### RNG Injection Strategy

Both `lock` and test helper functions use `generateRandomBytes(len, rng?)` to fill random buffers. This allows:

- **Production code** (no `rng` passed): Uses `crypto.getRandomValues()` for cryptographic-quality randomness.
- **Property tests** (injected `rng`): Passes a function `() => number` returning values in [0, 255]; the function can be seeded via fast-check's `fc.integer({ min: 0, max: 255 })` to create reproducible sequences.

**Example test pattern**:
```ts
const deterministicRng = (() => {
  const seed = [0x12, 0x34, 0x56, ...];
  let index = 0;
  return () => seed[index++ % seed.length];
})();

const result = await lock(plaintext, passphrase, { rng: deterministicRng, iterations: 1000 });
```

### Iteration Count Override

Both `lock` and `unlock` accept `options?.iterations` to override `PBKDF2_ITERATIONS` (310,000). This is **test-only**:

- **Production code**: Never passes `iterations`; always uses 310,000.
- **Fast tests**: Pass `iterations: 1000` to speed up property tests.
- **Real-iterations test**: Passes `iterations: 310_000` explicitly to verify performance and correctness with real parameters.

### Error Handling in unlock

The `unlock` function **never distinguishes** between:
- Wrong passphrase (key derivation correct but AES-GCM tag fails)
- Tampered ciphertext (AES-GCM tag fails)
- Tampered salt (key derivation fails; AES-GCM tag fails)
- Tampered IV (AES-GCM tag fails)
- Malformed salt/IV size (detected early, same error)

All map to `{ ok: false, error: 'wrong-passphrase' }`. This prevents the caller from inferring whether the problem is a mistyped passphrase or tampering.
