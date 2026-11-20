// Offline experiment: test whether ggwave 0.4.0 protocols survive phone-call audio codecs.
// Run with: node --experimental-strip-types spikes/codec-sim/run.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import factory, { type Ggwave, type GgwaveProtocol } from 'ggwave';
// @ts-expect-error -- Node --experimental-strip-types requires explicit .ts extension; tsconfig omits allowImportingTsExtensions
import { testPayload, checkPayload } from '../payload.ts';

const SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 4; // f32le
const PAD_BYTES = (SAMPLE_RATE / 2) * BYTES_PER_SAMPLE; // 0.5 s silence
const CHUNK_BYTES = 4096;
const PAYLOAD_LEN = 100;
const TRIALS = 10;
const VOLUME = Number(process.argv[2] ?? 10);

interface Channel {
  id: string;
  label: string;
  ext?: string;
  encodeArgs?: string[];
}

const CHANNELS: Channel[] = [
  { id: 'passthrough', label: 'Passthrough' },
  {
    id: 'amrnb-12.2k',
    label: 'AMR-NB 12.2k (8 kHz)',
    ext: 'amr',
    encodeArgs: ['-c:a', 'libopencore_amrnb', '-ar', '8000', '-ac', '1', '-b:a', '12.2k', '-f', 'amr'],
  },
  {
    id: 'amrnb-4.75k',
    label: 'AMR-NB 4.75k (8 kHz)',
    ext: 'amr',
    encodeArgs: ['-c:a', 'libopencore_amrnb', '-ar', '8000', '-ac', '1', '-b:a', '4.75k', '-f', 'amr'],
  },
  {
    id: 'amrwb-23.85k',
    label: 'AMR-WB 23.85k (16 kHz)',
    ext: 'amr',
    encodeArgs: ['-c:a', 'libvo_amrwbenc', '-ar', '16000', '-ac', '1', '-b:a', '23.85k', '-f', 'amr'],
  },
  {
    id: 'amrwb-12.65k',
    label: 'AMR-WB 12.65k (16 kHz)',
    ext: 'amr',
    encodeArgs: ['-c:a', 'libvo_amrwbenc', '-ar', '16000', '-ac', '1', '-b:a', '12.65k', '-f', 'amr'],
  },
  {
    id: 'opus-16k-16khz',
    label: 'Opus voip 16k (16 kHz)',
    ext: 'ogg',
    encodeArgs: ['-c:a', 'libopus', '-application', 'voip', '-ar', '16000', '-ac', '1', '-b:a', '16k', '-f', 'ogg'],
  },
  {
    id: 'opus-32k-48khz',
    label: 'Opus voip 32k (48 kHz)',
    ext: 'ogg',
    encodeArgs: ['-c:a', 'libopus', '-application', 'voip', '-ar', '48000', '-ac', '1', '-b:a', '32k', '-f', 'ogg'],
  },
];

function makeInstance(gg: Ggwave): number {
  const p = gg.getDefaultParameters();
  p.sampleRateInp = SAMPLE_RATE;
  p.sampleRateOut = SAMPLE_RATE;
  return gg.init(p);
}

function padSilence(raw: Int8Array): Int8Array {
  const padded = new Int8Array(PAD_BYTES + raw.length + PAD_BYTES);
  padded.set(raw, PAD_BYTES);
  return padded;
}

function runChannel(rawPadded: Int8Array, channel: Channel, tmpDir: string): Int8Array {
  if (!channel.encodeArgs || !channel.ext) return rawPadded;

  const inFile = path.join(tmpDir, 'in.f32');
  const midFile = path.join(tmpDir, `mid.${channel.ext}`);
  const outFile = path.join(tmpDir, 'out.f32');

  fs.writeFileSync(inFile, rawPadded);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', inFile,
    ...channel.encodeArgs,
    midFile,
  ]);
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-i', midFile,
    '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1',
    outFile,
  ]);

  const outBuf = fs.readFileSync(outFile);
  return new Int8Array(outBuf.buffer, outBuf.byteOffset, outBuf.byteLength);
}

function decodeAll(gg: Ggwave, samples: Int8Array): Uint8Array[] {
  const inst = makeInstance(gg);
  const decoded: Uint8Array[] = [];
  try {
    for (let i = 0; i < samples.length; i += CHUNK_BYTES) {
      const r = gg.decode(inst, samples.subarray(i, i + CHUNK_BYTES));
      if (r && r.length > 0) decoded.push(new Uint8Array(r));
    }
  } finally {
    gg.free(inst);
  }
  return decoded;
}

async function main() {
  const gg = await factory();
  gg.disableLog();

  const protocolMap = gg.ProtocolId as unknown as Record<string, GgwaveProtocol>;
  const protocols = Object.keys(protocolMap)
    .filter((k) => /^GGWAVE_PROTOCOL_(AUDIBLE|DT|MT)_/.test(k))
    .map((key) => ({ key, short: key.replace('GGWAVE_PROTOCOL_', ''), id: protocolMap[key]! }));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wail-codec-sim-'));
  const encInst = makeInstance(gg);

  try {
    const results: Array<{
      protocol: string;
      airTimeSec: number;
      scores: Record<string, { ok: number; damaged: number }>;
    }> = [];

    for (const proto of protocols) {
      const scores: Record<string, { ok: number; damaged: number }> = {};
      let airTimeSec = 0;

      // Encode each of the 10 payloads once per protocol (deterministic across channels).
      const encoded: Array<{ seq: number; padded: Int8Array }> = [];
      for (let seq = 1; seq <= TRIALS; seq++) {
        const raw = new Int8Array(gg.encode(encInst, testPayload(seq, PAYLOAD_LEN), proto.id, VOLUME));
        if (seq === 1) airTimeSec = raw.length / BYTES_PER_SAMPLE / SAMPLE_RATE;
        encoded.push({ seq, padded: padSilence(raw) });
      }

      for (const ch of CHANNELS) {
        let ok = 0;
        let damaged = 0;
        for (const { seq, padded } of encoded) {
          const rx = runChannel(padded, ch, tmpDir);
          const frames = decodeAll(gg, rx);
          const matched = frames.some((b) => {
            if (b.length !== PAYLOAD_LEN) return false;
            const c = checkPayload(b);
            return c.ok && c.seq === seq;
          });
          if (matched) {
            ok++;
          } else if (frames.length > 0) {
            damaged++;
          }
        }
        scores[ch.id] = { ok, damaged };
        process.stderr.write(`${proto.short.padEnd(16)} | ${ch.id.padEnd(15)} -> ${ok}/${TRIALS}${damaged ? ` (${damaged} damaged)` : ''}\n`);
      }

      results.push({ protocol: proto.short, airTimeSec, scores });
    }

    // Sanity check required by experiment spec
    const audibleNormal = results.find((r) => r.protocol === 'AUDIBLE_NORMAL');
    if (!audibleNormal || audibleNormal.scores['passthrough']?.ok !== TRIALS) {
      throw new Error(`Sanity check failed: AUDIBLE_NORMAL passthrough was ${audibleNormal?.scores['passthrough']?.ok ?? 'missing'}/${TRIALS}`);
    }

    // Print Markdown table
    const header = ['Protocol', 'Air time (100 B)', ...CHANNELS.map((c) => c.label)];
    console.log(`| ${header.join(' | ')} |`);
    console.log(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of results) {
      const cells = [
        row.protocol,
        `${row.airTimeSec.toFixed(2)} s`,
        ...CHANNELS.map((c) => {
          const s = row.scores[c.id]!;
          return s.damaged > 0 ? `${s.ok}/${TRIALS} (${s.damaged} bad)` : `${s.ok}/${TRIALS}`;
        }),
      ];
      console.log(`| ${cells.join(' | ')} |`);
    }
  } finally {
    gg.free(encInst);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

await main();
