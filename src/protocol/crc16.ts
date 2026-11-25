/**
 * CRC-16/CCITT-FALSE integrity check for individual frames.
 *
 * Poly: 0x1021, Init: 0xFFFF, Input Reflection: false, Output Reflection: false.
 * This variant is also called CRC-16/IBM-3740.
 *
 * Computed over the un-whitened bytes from magic through end of body (before crc16 itself).
 * Result is appended to the frame, then the entire region is whitened together.
 */

// Pre-computed lookup table for CRC-16/CCITT-FALSE.
// Generated at module load time (once) to avoid repeated calculation.
const CRC16_TABLE = generateCrc16Table();

function generateCrc16Table(): Uint16Array {
  const table = new Uint16Array(256);
  const poly = 0x1021;

  for (let i = 0; i < 256; i++) {
    let crc = (i << 8) >>> 0;
    for (let j = 0; j < 8; j++) {
      crc = (crc << 1) >>> 0;
      if ((crc & 0x10000) !== 0) {
        crc ^= poly;
      }
    }
    table[i] = crc & 0xffff;
  }

  return table;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection).
 *
 * @param bytes Input bytes (un-whitened: magic through end of body)
 * @returns 16-bit unsigned integer representing the CRC value
 */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]! ^ (crc >>> 8);
    crc = ((crc << 8) ^ CRC16_TABLE[byte]!) & 0xffff;
  }

  return crc;
}
