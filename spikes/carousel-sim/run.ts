// Offline experiment: broadcast carousel late-joiner recovery and room-echo (RT60) tolerance.
// Run with: node --experimental-strip-types spikes/carousel-sim/run.ts
import factory, { type Ggwave, type GgwaveProtocol } from 'ggwave';
// @ts-expect-error -- Node --experimental-strip-types requires explicit .ts extension; tsconfig omits allowImportingTsExtensions
import { testPayload, checkPayload } from '../payload.ts';

const SAMPLE_RATE = 48_000;
const CHUNK_SAMPLES = 1024; // 4096 bytes of f32le
const PAYLOAD_LEN = 100;
const NUM_FRAMES = 5;
const CYCLES = 3;
const LISTENERS = 20;
const VOLUME = 10;
const SNR_DB = 10;
const TAIL_SEC = 1.0; // trailing silence after cycle 3 to flush final end marker
const CYCLE2_FLUSH_SAMPLES = SAMPLE_RATE / 2; // 0.5 s (< shortest 3.75 s frame)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// In-place radix-2 Cooley-Tukey FFT.
function fft(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]!; re[i] = re[j]!; re[j] = tmp;
      tmp = im[i]!; im[i] = im[j]!; im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (invert ? 1 : -1);
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        const vRe = re[i + j + half]! * curRe - im[i + j + half]! * curIm;
        const vIm = re[i + j + half]! * curIm + im[i + j + half]! * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

// Overlap-add linear convolution using radix-2 FFT.
function convolveFft(signal: Float32Array, kernel: Float32Array): Float32Array {
  const kLen = kernel.length;
  let fftSize = 1;
  while (fftSize < kLen * 2) fftSize <<= 1;
  if (fftSize < 16384) fftSize = 16384;
  const blockLen = fftSize - kLen + 1;

  const hRe = new Float64Array(fftSize);
  const hIm = new Float64Array(fftSize);
  for (let i = 0; i < kLen; i++) hRe[i] = kernel[i]!;
  fft(hRe, hIm, false);

  const out = new Float32Array(signal.length + kLen - 1);
  const xRe = new Float64Array(fftSize);
  const xIm = new Float64Array(fftSize);

  for (let start = 0; start < signal.length; start += blockLen) {
    xRe.fill(0);
    xIm.fill(0);
    const end = Math.min(signal.length, start + blockLen);
    for (let i = start; i < end; i++) xRe[i - start] = signal[i]!;
    fft(xRe, xIm, false);
    for (let i = 0; i < fftSize; i++) {
      const a = xRe[i]!; const b = xIm[i]!;
      const c = hRe[i]!; const d = hIm[i]!;
      xRe[i] = a * c - b * d;
      xIm[i] = a * d + b * c;
    }
    fft(xRe, xIm, true);
    const outEnd = Math.min(out.length, start + fftSize);
    for (let i = start; i < outEnd; i++) {
      out[i] = out[i]! + xRe[i - start]!;
    }
  }
  return out;
}

// Synthetic room impulse response: direct impulse at n=0 + exponentially decaying white noise tail.
// Normalized so DRR = 0 dB (E_dir === E_rev) and total energy sum(h^2) === 1.
function makeRir(rt60Sec: number, rng: () => number): Float32Array {
  const len = Math.max(2, Math.ceil(1.2 * rt60Sec * SAMPLE_RATE));
  const h = new Float32Array(len);
  const alpha = (3 * Math.LN10) / rt60Sec; // -60 dB at t = rt60Sec
  let revEnergy = 0;
  for (let n = 1; n < len; n++) {
    const val = gaussian(rng) * Math.exp((-alpha * n) / SAMPLE_RATE);
    h[n] = val;
    revEnergy += val * val;
  }
  const revScale = 1 / Math.sqrt(revEnergy);
  const norm = 1 / Math.SQRT2; // total energy = (1 + 1) / 2 = 1
  h[0] = norm;
  for (let n = 1; n < len; n++) h[n] = h[n]! * revScale * norm;
  return h;
}

function selfCheckDsp(): void {
  const rng = mulberry32(42);
  const x = Float32Array.from({ length: 500 }, () => gaussian(rng));
  const k = Float32Array.from({ length: 137 }, () => gaussian(rng));
  const fast = convolveFft(x, k);
  let maxErr = 0;
  for (let i = 0; i < x.length + k.length - 1; i++) {
    let ref = 0;
    for (let j = 0; j < k.length; j++) {
      const xi = i - j;
      if (xi >= 0 && xi < x.length) ref += x[xi]! * k[j]!;
    }
    const err = Math.abs(fast[i]! - ref);
    if (err > maxErr) maxErr = err;
  }
  if (maxErr > 1e-4) throw new Error(`FFT convolution self-check failed: maxErr=${maxErr}`);

  const rir = makeRir(0.5, mulberry32(99));
  const eDir = rir[0]! * rir[0]!;
  let eRev = 0;
  for (let i = 1; i < rir.length; i++) eRev += rir[i]! * rir[i]!;
  const drrDb = 10 * Math.log10(eDir / eRev);
  if (Math.abs(drrDb) > 1e-3 || Math.abs(eDir + eRev - 1) > 1e-3) {
    throw new Error(`RIR self-check failed: DRR=${drrDb} dB, totalE=${eDir + eRev}`);
  }
}

function makeInstance(gg: Ggwave): number {
  const p = gg.getDefaultParameters();
  p.sampleRateInp = SAMPLE_RATE;
  p.sampleRateOut = SAMPLE_RATE;
  return gg.init(p);
}

function encodeFrames(gg: Ggwave, proto: GgwaveProtocol): Float32Array[] {
  const inst = makeInstance(gg);
  try {
    const frames: Float32Array[] = [];
    for (let seq = 1; seq <= NUM_FRAMES; seq++) {
      const raw = new Int8Array(gg.encode(inst, testPayload(seq, PAYLOAD_LEN), proto, VOLUME));
      const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      frames.push(new Float32Array(f32));
    }
    return frames;
  } finally {
    gg.free(inst);
  }
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

function buildBroadcast(frames: Float32Array[], gapMs: number) {
  const frameLen = frames[0]!.length;
  const gapLen = Math.round((gapMs / 1000) * SAMPLE_RATE);
  const slotLen = frameLen + gapLen;
  const cycleLen = NUM_FRAMES * slotLen;
  const tailLen = Math.round(TAIL_SEC * SAMPLE_RATE);
  const totalLen = CYCLES * cycleLen + tailLen;
  const samples = new Float32Array(totalLen);

  let energySum = 0;
  let activeCount = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) energySum += f[i]! * f[i]!;
    activeCount += f.length;
  }
  const activeRms = Math.sqrt(energySum / activeCount);

  for (let c = 0; c < CYCLES; c++) {
    for (let f = 0; f < NUM_FRAMES; f++) {
      samples.set(frames[f]!, c * cycleLen + f * slotLen);
    }
  }
  return { samples, frameLen, gapLen, slotLen, cycleLen, activeRms };
}

function addWhiteNoise(signal: Float32Array, refRms: number, snrDb: number, rng: () => number): Float32Array {
  const noiseStd = refRms / Math.pow(10, snrDb / 20);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i]! + gaussian(rng) * noiseStd;
  return out;
}

interface DecodeRun {
  gotByCycle2: Set<number>;
  gotByCycle3: Set<number>;
  totalValidDecodes: number;
  wrongBytes: Array<{ len: number; ok: boolean; seq: number; posSec: number }>;
  perCycleHits: [number, number, number];
}

function decodeFromOffset(gg: Ggwave, signal: Float32Array, offset: number, cycleLen: number): DecodeRun {
  const inst = makeInstance(gg);
  const gotByCycle2 = new Set<number>();
  const gotByCycle3 = new Set<number>();
  const wrongBytes: Array<{ len: number; ok: boolean; seq: number; posSec: number }> = [];
  const perCycleHits: [number, number, number] = [0, 0, 0];
  let totalValidDecodes = 0;

  try {
    const view = new Int8Array(signal.buffer, signal.byteOffset, signal.byteLength);
    const startByte = offset * 4;
    const chunkBytes = CHUNK_SAMPLES * 4;
    for (let b = startByte; b < view.length; b += chunkBytes) {
      const endByte = Math.min(view.length, b + chunkBytes);
      const r = gg.decode(inst, view.subarray(b, endByte));
      if (!r || r.length === 0) continue;
      const bytes = new Uint8Array(r);
      const chk = checkPayload(bytes);
      const posSamples = endByte / 4;
      if (bytes.length === PAYLOAD_LEN && chk.ok && chk.seq >= 1 && chk.seq <= NUM_FRAMES) {
        totalValidDecodes++;
        if (posSamples <= 2 * cycleLen + CYCLE2_FLUSH_SAMPLES) gotByCycle2.add(chk.seq);
        gotByCycle3.add(chk.seq);
        const cyc = posSamples <= cycleLen + CYCLE2_FLUSH_SAMPLES ? 0 : posSamples <= 2 * cycleLen + CYCLE2_FLUSH_SAMPLES ? 1 : 2;
        perCycleHits[cyc]++;
      } else {
        wrongBytes.push({ len: bytes.length, ok: chk.ok, seq: chk.seq, posSec: posSamples / SAMPLE_RATE });
      }
    }
  } finally {
    gg.free(inst);
  }
  return { gotByCycle2, gotByCycle3, totalValidDecodes, wrongBytes, perCycleHits };
}

function stats(vals: number[]): { min: number; median: number; max: number; fullCount: number } {
  const s = [...vals].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  const fullCount = s.filter((v) => v === NUM_FRAMES).length;
  return { min: s[0]!, median, max: s[s.length - 1]!, fullCount };
}

interface ConditionSummary {
  label: string;
  cleanOffset0Total: number; // out of 15 (3 cycles x 5 frames)
  cleanOffset0PerCycle: [number, number, number];
  c2: { min: number; median: number; max: number; fullCount: number };
  c3: { min: number; median: number; max: number; fullCount: number };
  midFrameJoined: number;
  midFrameRecoveredByC2: number;
  midFrameRecoveredByC3: number;
  nextFrameAfterJoinLost: number;
  wrongBytesCount: number;
}

function evaluateCondition(
  gg: Ggwave,
  label: string,
  noisySignal: Float32Array,
  frameLen: number,
  slotLen: number,
  cycleLen: number,
  seed: number,
): ConditionSummary {
  const rng = mulberry32(seed);
  // 1) Clean-start baseline at offset = 0 to detect tail-overlap losses cleanly.
  const clean0 = decodeFromOffset(gg, noisySignal, 0, cycleLen);

  // 2) 20 stratified random start offsets spread across cycle 1.
  const c2Counts: number[] = [];
  const c3Counts: number[] = [];
  let midFrameJoined = 0;
  let midFrameRecoveredByC2 = 0;
  let midFrameRecoveredByC3 = 0;
  let nextFrameAfterJoinLost = 0;
  let wrongBytesCount = clean0.wrongBytes.length;

  for (let i = 0; i < LISTENERS; i++) {
    const offset = Math.floor(((i + rng()) / LISTENERS) * cycleLen);
    const joinSlot = Math.min(NUM_FRAMES - 1, Math.floor(offset / slotLen));
    const inSlot = offset - joinSlot * slotLen;
    const isMidFrame = inSlot > 0 && inSlot < frameLen;
    const joinSeq = joinSlot + 1;

    const run = decodeFromOffset(gg, noisySignal, offset, cycleLen);
    c2Counts.push(run.gotByCycle2.size);
    c3Counts.push(run.gotByCycle3.size);
    wrongBytesCount += run.wrongBytes.length;

    if (isMidFrame) {
      midFrameJoined++;
      if (run.gotByCycle2.has(joinSeq)) midFrameRecoveredByC2++;
      if (run.gotByCycle3.has(joinSeq)) midFrameRecoveredByC3++;
      const nextSeq = (joinSlot + 1) % NUM_FRAMES + 1;
      if (!run.gotByCycle2.has(nextSeq)) nextFrameAfterJoinLost++;
    }
  }

  return {
    label,
    cleanOffset0Total: clean0.totalValidDecodes,
    cleanOffset0PerCycle: clean0.perCycleHits,
    c2: stats(c2Counts),
    c3: stats(c3Counts),
    midFrameJoined,
    midFrameRecoveredByC2,
    midFrameRecoveredByC3,
    nextFrameAfterJoinLost,
    wrongBytesCount,
  };
}

function fmtStats(s: { min: number; median: number; max: number; fullCount: number }): string {
  return `${s.min} / ${s.median} / ${s.max} (${s.fullCount}/${LISTENERS} got 5/5)`;
}

function runSingleCycle(gg: Ggwave, signal: Float32Array): { ok: number; bad: number } {
  const inst = makeInstance(gg);
  let ok = 0;
  let bad = 0;
  try {
    const view = new Int8Array(signal.buffer, signal.byteOffset, signal.byteLength);
    const chunkBytes = CHUNK_SAMPLES * 4;
    for (let b = 0; b < view.length; b += chunkBytes) {
      const r = gg.decode(inst, view.subarray(b, Math.min(view.length, b + chunkBytes)));
      if (!r || r.length === 0) continue;
      const bytes = new Uint8Array(r);
      const chk = checkPayload(bytes);
      if (bytes.length === PAYLOAD_LEN && chk.ok && chk.seq >= 1 && chk.seq <= NUM_FRAMES) ok++;
      else bad++;
    }
  } finally {
    gg.free(inst);
  }
  return { ok, bad };
}

function runMultiRoomCheck(gg: Ggwave, bySpeed: Array<{ speed: string; frames: Float32Array[] }>): void {
  console.log('\n### Multi-room RIR check (5 independent rooms, 1 cycle = 5 frames, G = 300 ms, +10 dB SNR, DRR = 0 dB)\n');
  console.log('| Speed | RT60 | 5 rooms (of 5 frames) | Mean | Wrong bytes |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const { speed, frames } of bySpeed) {
    const fl = frames[0]!.length;
    const gap = Math.round(0.3 * SAMPLE_RATE);
    const sl = fl + gap;
    const oneCycle = new Float32Array(NUM_FRAMES * sl + SAMPLE_RATE);
    for (let f = 0; f < NUM_FRAMES; f++) oneCycle.set(frames[f]!, f * sl);
    for (const rt60 of [0.2, 0.5, 0.8, 1.0, 1.2]) {
      const scores: number[] = [];
      let bad = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const rir = makeRir(rt60, mulberry32(seed * 100 + Math.round(rt60 * 10)));
        const rev = convolveFft(oneCycle, rir);
        const revRms = rms(rev.subarray(0, NUM_FRAMES * sl));
        const noisy = addWhiteNoise(rev, revRms, SNR_DB, mulberry32(seed * 999));
        const res = runSingleCycle(gg, noisy);
        scores.push(res.ok);
        bad += res.bad;
      }
      const mean = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
      console.log(`| ${speed} | ${rt60.toFixed(1)} s | ${scores.join(', ')} | ${mean}/5 | ${bad} |`);
    }
  }

  console.log('\n### Gap sensitivity under room echo (AUDIBLE_FAST, RT60 = 0.8 s, 5 rooms, 1 cycle = 5 frames)\n');
  console.log('| Gap G | 5 rooms (of 5 frames) | Mean | Wrong bytes |');
  console.log('| --- | --- | --- | --- |');
  const fast = bySpeed.find((s) => s.speed === 'AUDIBLE_FAST')!.frames;
  const fl = fast[0]!.length;
  for (const gapMs of [0, 100, 300, 600]) {
    const gap = Math.round((gapMs / 1000) * SAMPLE_RATE);
    const sl = fl + gap;
    const oneCycle = new Float32Array(NUM_FRAMES * sl + SAMPLE_RATE);
    for (let f = 0; f < NUM_FRAMES; f++) oneCycle.set(fast[f]!, f * sl);
    const scores: number[] = [];
    let bad = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const rir = makeRir(0.8, mulberry32(seed * 100 + 8));
      const rev = convolveFft(oneCycle, rir);
      const revRms = rms(rev.subarray(0, NUM_FRAMES * sl));
      const noisy = addWhiteNoise(rev, revRms, SNR_DB, mulberry32(seed * 999));
      const res = runSingleCycle(gg, noisy);
      scores.push(res.ok);
      bad += res.bad;
    }
    const mean = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    console.log(`| ${gapMs} ms | ${scores.join(', ')} | ${mean}/5 | ${bad} |`);
  }
}

async function main() {
  selfCheckDsp();
  const gg = await factory();
  gg.disableLog();

  const fastFrames = encodeFrames(gg, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST);
  const normalFrames = encodeFrames(gg, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL);
  const fastestFrames = encodeFrames(gg, gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST);

  if (process.argv.includes('--multi-room')) {
    runMultiRoomCheck(gg, [
      { speed: 'AUDIBLE_NORMAL', frames: normalFrames },
      { speed: 'AUDIBLE_FAST', frames: fastFrames },
      { speed: 'AUDIBLE_FASTEST', frames: fastestFrames },
    ]);
    return;
  }

  process.stderr.write(
    `Frame lengths (100 B): NORMAL=${(normalFrames[0]!.length / SAMPLE_RATE).toFixed(2)}s, ` +
    `FAST=${(fastFrames[0]!.length / SAMPLE_RATE).toFixed(2)}s, ` +
    `FASTEST=${(fastestFrames[0]!.length / SAMPLE_RATE).toFixed(2)}s\n`,
  );

  // --- Experiment 1: Late joiner across gaps G = 0, 100, 300, 600 ms (AUDIBLE_FAST, +10 dB white noise) ---
  const exp1Results: ConditionSummary[] = [];
  const gaps = [0, 100, 300, 600];
  for (let gi = 0; gi < gaps.length; gi++) {
    const gapMs = gaps[gi]!;
    const bc = buildBroadcast(fastFrames, gapMs);
    const noisy = addWhiteNoise(bc.samples, bc.activeRms, SNR_DB, mulberry32(1000 + gi));
    const res = evaluateCondition(gg, `G = ${gapMs} ms`, noisy, bc.frameLen, bc.slotLen, bc.cycleLen, 2000 + gi);
    exp1Results.push(res);
    process.stderr.write(
      `[Exp1] ${res.label.padEnd(11)} | offset0=${res.cleanOffset0Total}/15 [${res.cleanOffset0PerCycle.join(',')}] | ` +
      `C2=${fmtStats(res.c2)} | C3=${fmtStats(res.c3)} | midRecovC2=${res.midFrameRecoveredByC2}/${res.midFrameJoined} | bad=${res.wrongBytesCount}\n`,
    );
  }

  // --- Experiment 2: Room echo (synthetic RIR, DRR ~0 dB, G = 300 ms, +10 dB white noise) ---
  const exp2Configs: Array<{ speed: string; frames: Float32Array[]; rt60s: number[] }> = [
    { speed: 'AUDIBLE_FAST', frames: fastFrames, rt60s: [0.2, 0.5, 0.8, 1.2] },
    { speed: 'AUDIBLE_NORMAL', frames: normalFrames, rt60s: [0.2, 0.5, 0.8, 1.2] },
    { speed: 'AUDIBLE_FASTEST', frames: fastestFrames, rt60s: [0.2, 0.5, 0.8, 1.2] },
  ];

  const exp2Results: ConditionSummary[] = [];
  let idx = 0;
  for (const cfg of exp2Configs) {
    const bc = buildBroadcast(cfg.frames, 300);
    for (const rt60 of cfg.rt60s) {
      idx++;
      const rir = makeRir(rt60, mulberry32(3000 + idx));
      const reverb = convolveFft(bc.samples, rir);
      // Measure active RMS over the reverberant broadcast (first 3 cycles) for accurate +10 dB SNR.
      const revActiveRms = rms(reverb.subarray(0, CYCLES * bc.cycleLen));
      const noisy = addWhiteNoise(reverb, revActiveRms, SNR_DB, mulberry32(4000 + idx));
      const label = `${cfg.speed} | RT60 = ${rt60.toFixed(1)} s`;
      const res = evaluateCondition(gg, label, noisy, bc.frameLen, bc.slotLen, bc.cycleLen, 5000 + idx);
      exp2Results.push(res);
      process.stderr.write(
        `[Exp2] ${res.label.padEnd(28)} | offset0=${res.cleanOffset0Total}/15 [${res.cleanOffset0PerCycle.join(',')}] | ` +
        `C2=${fmtStats(res.c2)} | C3=${fmtStats(res.c3)} | midRecovC2=${res.midFrameRecoveredByC2}/${res.midFrameJoined} | bad=${res.wrongBytesCount}\n`,
      );
    }
  }

  console.log('\n### Experiment 1 (AUDIBLE_FAST, +10 dB SNR, no echo)\n');
  console.log('| Gap G | Offset=0 (of 15) | End of Cycle 2 (min/med/max) | End of Cycle 3 (min/med/max) | Mid-frame recovered by C2 | Wrong bytes |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of exp1Results) {
    console.log(
      `| ${r.label} | ${r.cleanOffset0Total}/15 (${r.cleanOffset0PerCycle.join('/')}) | ${fmtStats(r.c2)} | ${fmtStats(r.c3)} | ${r.midFrameRecoveredByC2}/${r.midFrameJoined} | ${r.wrongBytesCount} |`,
    );
  }

  console.log('\n### Experiment 2 (G = 300 ms, +10 dB SNR, DRR = 0 dB)\n');
  console.log('| Speed & RT60 | Offset=0 (of 15) | End of Cycle 2 (min/med/max) | End of Cycle 3 (min/med/max) | Mid-frame recovered by C2 | Wrong bytes |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of exp2Results) {
    console.log(
      `| ${r.label} | ${r.cleanOffset0Total}/15 (${r.cleanOffset0PerCycle.join('/')}) | ${fmtStats(r.c2)} | ${fmtStats(r.c3)} | ${r.midFrameRecoveredByC2}/${r.midFrameJoined} | ${r.wrongBytesCount} |`,
    );
  }
}

await main();
