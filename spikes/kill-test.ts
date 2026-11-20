// Day-1 kill test. Throwaway spike written during planning (not product code).
// The product uses an AudioWorklet; this spike uses ScriptProcessor for brevity.
import factory, { type GgwaveProtocol } from 'ggwave';
import { testPayload, checkPayload } from './payload';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (s: string) => ($('log').textContent = `${new Date().toLocaleTimeString()}  ${s}\n` + $('log').textContent);

const gg = await factory();
gg.disableLog();
const ctx = new AudioContext({ sampleRate: 48000 });
const params = gg.getDefaultParameters();
params.sampleRateInp = ctx.sampleRate;
params.sampleRateOut = ctx.sampleRate;
const inst = gg.init(params);

let ok = 0, bad = 0, sent = 0;
const tally = () => ($('tally').textContent = `received OK: ${ok} · damaged: ${bad} · sent: ${sent}`);
log(`ready, sample rate ${ctx.sampleRate} Hz`);

$('listen').onclick = async () => {
  await ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(1024, 1, 1);
  proc.onaudioprocess = (e) => {
    const samples = new Float32Array(e.inputBuffer.getChannelData(0));
    const res = gg.decode(inst, new Int8Array(samples.buffer));
    if (!res || res.length === 0) return;
    const bytes = new Uint8Array(res); // copy out of WASM memory
    const r = checkPayload(bytes);
    r.ok ? ok++ : bad++;
    tally();
    log(r.ok ? `OK  #${r.seq} (${bytes.length} B)` : `DAMAGED (${bytes.length} B)`);
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  $('listen').textContent = 'Listening…';
  log('listening');
};

function play(bytes: Uint8Array, protocol: GgwaveProtocol): Promise<void> {
  const wav = new Int8Array(gg.encode(inst, bytes, protocol, 10)); // copy before next call
  const f32 = new Float32Array(wav.buffer);
  const buf = ctx.createBuffer(1, f32.length, ctx.sampleRate);
  buf.getChannelData(0).set(f32);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  return new Promise((done) => {
    node.onended = () => done();
    node.start();
  });
}

$('send').onclick = async () => {
  await ctx.resume();
  const protocol = gg.ProtocolId[$<HTMLSelectElement>('proto').value as keyof typeof gg.ProtocolId];
  const len = Math.min(140, Math.max(4, Number($<HTMLInputElement>('len').value)));
  const tries = Number($<HTMLInputElement>('tries').value);
  for (let i = 0; i < tries; i++) {
    const seq = sent + 1;
    await play(testPayload(seq, len), protocol);
    sent++;
    tally();
    log(`sent #${seq} (${len} B)`);
    await new Promise((r) => setTimeout(r, 1000));
  }
};

$('reset').onclick = () => {
  ok = bad = sent = 0;
  tally();
};
