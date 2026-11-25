/**
 * XOR masking with xorshift32 pseudo-random stream.
 *
 * Used to remove low-entropy byte patterns before modulation so ggwave never sees
 * them and silently corrupts the data. The mask is seeded by a 1-byte salt,
 * making it repeatable for each transmission (involution property).
 */

/**
 * XOR `bytes` with an xorshift32 stream seeded by `(0x57A11 ^ salt * 0x9E3779B1)`.
 * Seed 0 is replaced with 1.
 *
 * Returns a new Uint8Array. Applying this function twice with the same salt
 * recovers the original bytes (involution property). Never mutates the input.
 *
 * Both encoding and decoding use this function; the two calls are identical.
 *
 * @param bytes Input bytes to whiten
 * @param salt 1-byte value (0–255) seeding the stream; different for each repeat
 * @returns New Uint8Array with XOR mask applied
 */
export function whiten(bytes: Uint8Array, salt: number): Uint8Array {
  let seed = (0x57a11 ^ Math.imul(salt, 0x9e3779b1)) >>> 0 || 1;
  const out = new Uint8Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    out[i] = bytes[i]! ^ (seed & 0xff);
  }

  return out;
}
