# Requirements Document

## Introduction

The crypto layer (`src/pipeline/`) encrypts and decrypts Wail message payloads before framing and after reassembly. It implements a symmetric lock using PBKDF2-SHA-256 key derivation (310,000 iterations, 16-byte random salt per message) and AES-GCM-256 authenticated encryption with a 12-byte random IV. The layer is pure TypeScript with no DOM or Web Audio dependencies, runs deterministically in Node and browsers via `globalThis.crypto.subtle`, and supports injectable randomness and iteration-count configuration for property testing.

Sources of truth: `docs/planning/04-prd.md` (R6, R7), `docs/planning/06-architecture.md` (security table, property P5), `.kiro/steering/protocol.md` (manifest fields `enc_salt` and `iv`), `src/protocol/types.ts` (`LockedManifestBody`), `.kiro/steering/tech.md` (Web Crypto and PBKDF2 details).

---

## Glossary

- **Passphrase**: A human-entered string, normalised with Unicode NFC and trimmed of leading/trailing whitespace before key derivation. It is never stored or logged. If empty after trimming, it is rejected.
- **PBKDF2-SHA-256**: Password-Based Key Derivation Function 2 using HMAC-SHA-256. Default iteration count: 310,000. The result is a 32-byte key.
- **enc_salt**: A 16-byte random value used as the salt for PBKDF2. Generated fresh for each locked message and stored unencrypted in the manifest so the receiver can derive the same key.
- **IV (Initialisation Vector)**: A 12-byte random value used as the nonce for AES-GCM. Generated fresh for each locked message and stored unencrypted in the manifest.
- **AES-GCM-256**: AES in Galois/Counter Mode with a 256-bit key. Provides both confidentiality and authenticity; the tag is 16 bytes and is verified automatically on decryption.
- **Ciphertext**: The encrypted output from AES-GCM, with the 16-byte authentication tag appended. Its length is plaintext.length + 16; the tag travels inside these ciphertext bytes and is verified on decrypt.
- **Tag**: The 16-byte authentication tag produced by AES-GCM. If decryption is attempted with wrong key or tampered ciphertext, the tag fails to verify and an error is raised. Wail catches this error and returns a structured failure result instead of throwing.
- **lock(plaintext, passphrase, options?)**: Async function that derives a key from the passphrase, generates fresh salt and IV, and returns the ciphertext with metadata. Never throws; returns a result type.
- **unlock(ciphertext, passphrase, encSalt, iv, options?)**: Async function that derives the same key, attempts AES-GCM decryption, and returns `{ ok: true, plaintext }` on success or `{ ok: false, error: 'wrong-passphrase' }` on failure. Never throws for wrong passphrase or tampered data; never returns bytes on failure.
- **Round-trip property**: For any plaintext and passphrase, `unlock(lock(plaintext, passphrase).ciphertext, passphrase, salt, iv).plaintext == plaintext`.

---

## Requirements

### Requirement 1: Passphrase normalisation and validation

**User Story:** As a user speaking a passphrase over the air to multiple people typing it on different phones, I want it normalised so a typed or spoken accent does not cause decryption to fail.

#### Acceptance Criteria

1. BEFORE deriving a key, THE lock function SHALL normalise the input passphrase to Unicode Normal Form C (NFC).
2. AFTER normalisation, THE lock function SHALL trim leading and trailing whitespace from the passphrase (using JavaScript `String.prototype.trim()`).
3. IF the trimmed passphrase is an empty string, THEN THE lock function SHALL return an error `{ ok: false, error: 'empty-passphrase' }` and SHALL NOT perform key derivation or encryption.
4. WHEN unlocking, THE unlock function SHALL apply the same normalisation (NFC) and trimming to the input passphrase before deriving the key.
5. FOR ALL passphrases that are canonically equivalent (e.g., precomposed U+00E9 vs 'e' + U+0301 combining acute), NFC normalisation SHALL produce identical derived keys. FOR ALL passphrases differing only in case or accents (e.g., 'café' vs 'CAFÉ'), THE keys SHALL be DIFFERENT. FOR ALL passphrases differing only in surrounding whitespace (e.g., '  passphrase  ' vs 'passphrase'), trimming SHALL produce identical derived keys (normalisation equivalence property for canonical forms and whitespace only).
6. THE unlock function SHALL accept a passphrase input that may be different from the one used in lock (e.g., a user may type it again). If the derived keys differ, the AES-GCM tag verification SHALL fail, and the function SHALL return `{ ok: false, error: 'wrong-passphrase' }`.

---

### Requirement 2: PBKDF2-SHA-256 key derivation

**User Story:** As a sender protecting a message with a spoken passphrase, I want the passphrase stretched through a computationally expensive function so a dictionary attack remains infeasible.

#### Acceptance Criteria

1. WHEN locking, THE lock function SHALL use PBKDF2-SHA-256 with the normalised and trimmed passphrase as the input.
2. THE PBKDF2 function SHALL take the following parameters:
   - **Algorithm**: `PBKDF2` with hash `SHA-256`.
   - **Iterations**: 310,000 (default, overridable for tests only via an injected option).
   - **Salt**: The 16-byte `enc_salt`, generated fresh and randomly for each message.
   - **Derived key length**: 32 bytes (256 bits for AES-256).
3. FOR ALL invocations of PBKDF2 with the same passphrase, salt, iteration count and hash algorithm, THE result SHALL be the same 32-byte key (determinism property).

---

### Requirement 3: Random salt and IV generation

**User Story:** As a sender, I want each encrypted message to use fresh, unpredictable salt and IV so that two encryptions of the same plaintext with the same passphrase are indistinguishable.

#### Acceptance Criteria

1. WHEN locking, THE lock function SHALL generate a random 16-byte `enc_salt` using an injectable random-byte source (a function `() => number` returning values 0–255) or the system CSPRNG if no source is provided.
2. WHEN locking, THE lock function SHALL generate a random 12-byte `iv` using the same random source or CSPRNG.
3. WHEN locking the same plaintext twice with the same passphrase, THE two calls SHALL produce different ciphertexts due to different salts and IVs (two-ciphertexts property, related to P5).
4. THE random-byte source SHALL be injectable via a constructor option or configuration parameter, so property tests can supply deterministic sequences.
5. WHEN no injectable source is provided, THE lock function SHALL use `globalThis.crypto.getRandomValues()` to populate the salt and IV with cryptographic-quality randomness.

---

### Requirement 4: AES-GCM-256 encryption and decryption

**User Story:** As a sender, I want payload bytes encrypted with AES-GCM so only someone with the correct passphrase can read it, and so tampering is detected.

#### Acceptance Criteria

1. WHEN locking, THE lock function SHALL use the derived 32-byte key to encrypt the plaintext with AES-GCM-256 using the generated `iv` as the nonce.
2. THE AES-GCM algorithm SHALL be used with:
   - **Algorithm name**: `AES-GCM`.
   - **Key**: 32-byte key from PBKDF2.
   - **IV (nonce)**: 12-byte `iv` generated fresh per message.
   - **Additional authenticated data (AAD)**: none.
3. THE AES-GCM encryption SHALL produce a ciphertext with the 16-byte authentication tag appended; the total length is plaintext.length + 16 bytes.
4. WHEN unlocking, THE unlock function SHALL use the derived key (from the same passphrase and `enc_salt`) and the stored `iv` to decrypt the ciphertext.
5. WHEN decryption succeeds, THE unlock function SHALL return the plaintext as `{ ok: true, plaintext }`.
6. WHEN decryption fails (wrong key, tampered ciphertext, or tampered nonce), the Web Crypto API SHALL raise an error. THE unlock function SHALL catch this error and return `{ ok: false, error: 'wrong-passphrase' }` **without exposing the error message or any ciphertext bytes to the caller**.
7. THE unlock function SHALL NEVER throw an exception when given wrong passphrase, tampered data, or any other decryption failure. All errors SHALL be caught and converted to the structured result type.

---

### Requirement 5: Lock and unlock function signatures

**User Story:** As an application developer integrating crypto into the message pipeline, I want clear, type-safe function signatures that match the pipeline's layer design.

#### Acceptance Criteria

1. THE lock function SHALL have the signature `lock(plaintext: Uint8Array, passphrase: string, options?: { rng?: RngSource; iterations?: number }): Promise<LockResult>`.
2. THE LockResult type SHALL be `{ ok: true; ciphertext: Uint8Array; encSalt: Uint8Array; iv: Uint8Array } | { ok: false; error: 'empty-passphrase' }`.
3. THE unlock function SHALL have the signature `unlock(ciphertext: Uint8Array, passphrase: string, encSalt: Uint8Array, iv: Uint8Array, options?: { iterations?: number }): Promise<UnlockResult>`.
4. THE UnlockResult type SHALL be `{ ok: true; plaintext: Uint8Array } | { ok: false; error: 'wrong-passphrase' }`.
5. WHEN unlock is called with wrong passphrase or tampered ciphertext, it SHALL return `{ ok: false, error: 'wrong-passphrase' }` **only**; it SHALL NOT return variant errors like `'corrupted-tag'` or `'wrong-iv'`, so the caller cannot infer whether the user mistyped the passphrase or someone tampered with the message.
6. THE options parameter SHALL accept `rng` and `iterations` fields. If present, `rng` overrides the CSPRNG for salt/IV generation (lock only), and `iterations` overrides the default 310,000 (both lock and unlock).
7. The iteration count option SHALL be used only in test mode; product code never passes it and always uses 310,000. Test mode uses 1,000 iterations for speed unless a specific test requires the real value.

---

### Requirement 6: Input and output format for lock and unlock

**User Story:** As a protocol developer, I want ciphertext and salt/IV serialised consistently with the manifest structure so round-trip through the packet layer is guaranteed.

#### Acceptance Criteria

1. THE plaintext input to lock SHALL be a `Uint8Array` of 0 to 2,048 bytes (the test range; the protocol layer enforces the actual size limit).
2. THE ciphertext output from lock SHALL be a `Uint8Array` of length plaintext.length + 16 (the 16-byte tag appended).
3. THE `encSalt` output from lock SHALL be a `Uint8Array` of exactly 16 bytes.
4. THE `iv` output from lock SHALL be a `Uint8Array` of exactly 12 bytes.
5. WHEN these values are stored in the manifest body (as per `.kiro/steering/protocol.md`), they SHALL be serialised as fixed-length byte sequences with no length prefix or framing.
6. WHEN deserialised from the manifest body for unlock, the caller SHALL provide `encSalt` as a 16-byte `Uint8Array` and `iv` as a 12-byte `Uint8Array`. THE unlock function SHALL NOT validate these sizes; if they are wrong, the decryption SHALL fail and return `{ ok: false, error: 'wrong-passphrase' }`.

---

### Requirement 7: No passphrase storage or logging

**User Story:** As a user, I want assurance that my spoken passphrase is never persisted or logged, so it cannot leak from device storage or logs.

#### Acceptance Criteria

1. THE lock and unlock functions SHALL NOT store the passphrase in any object field, instance variable, or closure variable that persists after the function returns.
2. THE lock and unlock functions SHALL NOT log the passphrase or any derived key to `console`, error handlers, or any external service.
3. THE passphrase input to lock and unlock SHALL be treated as a local variable scoped only to the function body. After the function returns, it is eligible for garbage collection.
4. IF an error is thrown during PBKDF2 or AES-GCM operations (e.g., from the Web Crypto API), the error handler SHALL NOT include the passphrase, key, or ciphertext in the error message or logged context.

---

### Requirement 8: Browser and Node compatibility

**User Story:** As a developer shipping on Android, iOS and desktop, I want crypto to work in modern browsers and in test environments (Node 22).

#### Acceptance Criteria

1. THE lock and unlock functions SHALL use only `globalThis.crypto.subtle` for PBKDF2 and AES-GCM operations, which is the standard Web Crypto API available in Node 22 and all modern browsers.
2. THE functions SHALL NOT import or depend on any external cryptography library (e.g., `tweetnacl`, `libsodium`, `crypto-js`). They are pure TypeScript functions using only Web Crypto.
3. FOR randomness, the functions SHALL use `globalThis.crypto.getRandomValues()` for the system CSPRNG (salt and IV generation).
4. WHEN running in Node 22 or a browser, the functions SHALL execute deterministically for a given passphrase, plaintext, salt, IV and iteration count (Node and browser produce the same ciphertext for the same inputs).

---

## Properties

### Property P5: Round-trip and passphrase sensitivity (R6, R7)

**What it covers:** Lock then unlock with the same passphrase returns the plaintext; any different passphrase or tampered data fails.

#### Sub-properties

1. **P5a — Identity:** FOR ALL plaintexts of 0 to 2,048 bytes and all passphrases, `unlock(lock(plaintext, passphrase).ciphertext, passphrase, salt, iv).plaintext == plaintext` (round-trip identity, determinism given the same salt/IV).
2. **P5b — Passphrase sensitivity:** FOR ALL plaintexts, passphrases and reference passphrases that differ in at least one character after normalisation and trimming, `unlock(lock(plaintext, passphrase).ciphertext, differentPassphrase, salt, iv).ok == false` (AES-GCM tag rejects wrong key).
3. **P5c — Salt sensitivity:** FOR ALL plaintexts, passphrases and two different salts `salt1 ≠ salt2`, the ciphertexts produced by PBKDF2 with `salt1` and `salt2` are different. When unlock is called with `salt1` but the ciphertext was encrypted with `salt2`, the result SHALL be `{ ok: false, error: 'wrong-passphrase' }`.
4. **P5d — IV sensitivity:** FOR ALL plaintexts, passphrases and two different IVs `iv1 ≠ iv2`, when AES-GCM decryption is attempted with the wrong IV, the AES-GCM tag SHALL fail to verify and the result SHALL be `{ ok: false, error: 'wrong-passphrase' }`.
5. **P5e — Bit-flip detection:** FOR ALL ciphertexts produced by lock, flipping any single bit anywhere in the ciphertext, `enc_salt` or `iv` SHALL cause unlock to return `{ ok: false, error: 'wrong-passphrase' }` (AES-GCM authentication).
6. **P5f — Fresh randomness:** FOR ALL plaintexts and passphrases, calling lock twice with the same inputs but no injected RNG (using the system CSPRNG) SHALL produce different ciphertexts due to different salts and IVs (two-ciphertexts property).

#### Test file locations

- `tests/pipeline/R6.lock-round-trip.prop.test.ts` — covers P5a, P5b, P5c, P5d, with 1,000 runs; plaintext sizes 0, 1, 10, 100, 1,000, 2,048; passphrase types (empty → rejected, ASCII, Unicode, whitespace, NFC-equivalent forms).
- `tests/pipeline/R6.bit-flip-detection.prop.test.ts` — covers P5e, testing that any single bit flip in ciphertext/salt/iv breaks decrypt, with 1,000 runs; plaintext 50–200 bytes, passphrase ASCII + Unicode mix.
- `tests/pipeline/R6.fresh-randomness.prop.test.ts` — covers P5f, calling lock 10 times with the same input, using the default CSPRNG (no injected RNG), with iterations 1,000, and verifying all 10 ciphertexts differ, 1,000 runs; combined with P5a by using injected RNG so the test is fast.
- `tests/pipeline/R6.real-iterations.prop.test.ts` — executes lock and unlock with the actual 310,000 iterations (not reduced for speed); 2 runs; plaintext 100 bytes, passphrase 10–20 characters. Verifies that the real iteration count is used in production and that the performance is acceptable.

---

## Implementation notes

- The module SHALL be located in `src/pipeline/` and exported as named functions `lock` and `unlock` (not a class).
- Both functions are pure: no side effects, no external state, no DOM or IndexedDB access.
- Error handling SHALL convert Web Crypto exceptions into the structured result type. The `SubtleBase.decrypt()` function throws when the tag verification fails; catch and map to `{ ok: false, error: 'wrong-passphrase' }`.
- The iteration count override is for tests only. The recommendation is to export a separate internal function or use a build-time constant so production code always uses 310,000.
- Injectable RNG is used in tests to make the salt/IV generation deterministic. Each test run with injected RNG can be reproduced by using the same RNG seed sequence.
- No crypto state is shared between lock and unlock calls; each is independent.
