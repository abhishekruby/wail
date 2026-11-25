/**
 * CRC-32 integrity check for reassembled payloads.
 *
 * Poly: 0xEDB88320 (reflected), Init: 0xFFFFFFFF, Final XOR: 0xFFFFFFFF.
 * This is the standard ISO 3309 / IEEE 802.3 variant used by zlib and Ethernet.
 *
 * Computed over the complete reassembled payload. CRC-32 mismatch after reassembly
 * causes the message to be discarded, catching any bit error that survived the
 * per-frame CRC-16 check.
 */

// Pre-computed lookup table for IEEE CRC-32.
// Generated at module load time (once) to avoid repeated calculation.
const CRC32_TABLE = generateCrc32Table();

function generateCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  const poly = 0xedb88320;

  for (let i = 0; i < 256; i++) {
    let crc = i >>> 0;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ poly;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }

  return table;
}

/**
 * ISO 3309 / IEEE 802.3 CRC-32 (poly 0xEDB88320 reflected).
 *
 * @param bytes Input bytes (complete reassembled payload)
 * @returns 32-bit unsigned integer representing the CRC value
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
