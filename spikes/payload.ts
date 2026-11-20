// Deterministic test payloads, so the receiver can check every byte without the sender's copy.
// Bytes 0-1: sequence number (little-endian). The rest: a pattern derived from seq and position.

const patternByte = (seq: number, i: number) => (seq * 31 + i * 7 + 11) & 0xff;

export function testPayload(seq: number, len: number): Uint8Array {
  const b = new Uint8Array(len);
  b[0] = seq & 0xff;
  b[1] = (seq >> 8) & 0xff;
  for (let i = 2; i < len; i++) b[i] = patternByte(seq, i);
  return b;
}

export function checkPayload(b: Uint8Array): { ok: boolean; seq: number } {
  if (b.length < 2) return { ok: false, seq: -1 };
  const seq = b[0]! | (b[1]! << 8);
  for (let i = 2; i < b.length; i++) if (b[i] !== patternByte(seq, i)) return { ok: false, seq };
  return { ok: true, seq };
}
