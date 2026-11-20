// Facts about ggwave 0.4.0 that the Wail protocol design depends on (lab findings, Nov 20, 2026).
// All cases are deterministic so CI never flakes. If a ggwave upgrade changes one, revisit src/protocol.
import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import factory, { type Ggwave, type GgwaveInstance, type GgwaveProtocol } from 'ggwave';
import { testPayload, checkPayload } from '../spikes/payload';

let gg: Ggwave;
let inst: GgwaveInstance;

beforeAll(async () => {
  gg = await factory();
  gg.disableLog();
  const p = gg.getDefaultParameters();
  p.sampleRateInp = 48000;
  p.sampleRateOut = 48000;
  inst = gg.init(p);
});

function roundtrip(bytes: Uint8Array, protocol: GgwaveProtocol): Uint8Array | null {
  const wav = new Int8Array(gg.encode(inst, bytes, protocol, 10));
  let out: Uint8Array | null = null;
  for (let i = 0; i < wav.length; i += 4096) {
    const r = gg.decode(inst, wav.subarray(i, i + 4096));
    if (r && r.length) out = new Uint8Array(r);
  }
  return out;
}

// Reference whitening (xorshift32 mask seeded by a 1-byte salt). The product version lives in src/protocol.
function whiten(bytes: Uint8Array, salt: number): Uint8Array {
  let s = (0x57a11 ^ Math.imul(salt, 0x9e3779b1)) >>> 0 || 1;
  return bytes.map((v) => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return v ^ (s & 0xff);
  });
}

describe('ggwave baseline', () => {
  it('silently truncates payloads over 140 B, so the packet layer must enforce the limit', () => {
    expect(roundtrip(new Uint8Array(141).fill(7), gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL)?.length).toBe(140);
  });

  it('can return WRONG bytes with no error on a clean signal (found by fast-check)', () => {
    const tiny = Uint8Array.from([0, 80]);
    expect(roundtrip(tiny, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST)).not.toEqual(tiny);
    const zeros33 = new Uint8Array(33);
    expect(roundtrip(zeros33, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST)).not.toEqual(zeros33);
  });

  it('whitening removes the known zero-run failure', () => {
    const zeros33 = new Uint8Array(33);
    const out = roundtrip(whiten(zeros33, 0), gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST);
    expect(out && whiten(out, 0)).toEqual(zeros33);
  });

  it('round-trips random 12 to 128 B frames exactly at NORMAL speed (fixed seed)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 12, maxLength: 128 }), (bytes) => {
        expect(roundtrip(bytes, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL)).toEqual(bytes);
      }),
      { numRuns: 20, seed: 20261120 },
    );
  });

  it('kill-test payloads verify themselves', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 65535 }), fc.integer({ min: 4, max: 140 }), (seq, len) => {
        expect(checkPayload(testPayload(seq, len))).toEqual({ ok: true, seq });
      }),
    );
  });
});
