// Spike: end-to-end radio check with the real product layers (not product code).
// protocol (split, resalt, decode, reassemble) + GgwaveModem + src/audio (worklet mic, playback).
import { splitPayload, resaltFrame, decodeFrame, createReassembler } from '../src/protocol/index';
import { GgwaveModem } from '../src/modem/ggwave-modem';
import { getAudioContext, resumeAudio } from '../src/audio/audio-context';
import { startMic, type MicCapture } from '../src/audio/mic-capture';
import { playSamples } from '../src/audio/playback';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (s: string) => ($('log').textContent = `${new Date().toLocaleTimeString()}  ${s}\n` + $('log').textContent);
const speed = () => $<HTMLSelectElement>('speed').value as 'fast' | 'normal';

let mic: MicCapture | null = null;

async function modemFor(ctx: AudioContext): Promise<GgwaveModem> {
  return GgwaveModem.create({ sampleRate: ctx.sampleRate, speed: speed(), volume: Number($<HTMLSelectElement>('vol').value) });
}

$('listen').onclick = async () => {
  if (mic) {
    mic.stop();
    mic = null;
    $('listen').textContent = 'Listen';
    log('stopped listening');
    return;
  }
  await resumeAudio();
  const ctx = getAudioContext();
  const modem = await modemFor(ctx);
  const reassembler = createReassembler();
  let blocks = 0;
  try {
    mic = await startMic(ctx, (samples) => {
      blocks++;
      for (const raw of modem.feed(samples)) {
        const frame = decodeFrame(raw);
        if (!frame) {
          log(`frame rejected by CRC-16 (${raw.length} B)`);
          continue;
        }
        log(`frame ok: seq ${frame.seq} of message ${frame.messageId}`);
        const r = reassembler.feed(frame);
        if (r.status === 'complete') {
          $('got').textContent = new TextDecoder().decode(r.payload);
          log('MESSAGE COMPLETE');
        } else if (r.status === 'crc-fail') {
          log('message CRC-32 failed, waiting for the next cycle');
        }
      }
    });
  } catch (e) {
    log(`mic error: ${(e as { code?: string }).code ?? 'unknown'} ${(e as Error).message}`);
    return;
  }
  setInterval(() => $('listen').setAttribute('title', `${blocks} blocks`), 1000);
  $('listen').textContent = 'Stop';
  log(`listening at ${ctx.sampleRate} Hz, ${speed()}`);
};

$('send').onclick = async () => {
  await resumeAudio();
  const ctx = getAudioContext();
  const modem = await modemFor(ctx);
  const payload = new TextEncoder().encode($<HTMLTextAreaElement>('msg').value);
  const split = splitPayload(payload, { kind: 0, flags: { compressed: false, locked: false, broadcast: true } });
  if (!split.ok) {
    log(`split failed: ${split.error}`);
    return;
  }
  const gap = new Float32Array(Math.round(ctx.sampleRate * 0.3));
  log(`sending ${payload.length} B as ${split.frames.length} frames × 3 cycles, ${speed()}, volume ${$<HTMLSelectElement>('vol').value}`);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const f of split.frames) {
      const frame = cycle === 0 ? f : resaltFrame(f, (f[0]! + cycle * 85) & 0xff);
      const enc = modem.encode(frame);
      if (!enc.ok) {
        log(`encode failed: ${enc.error}`);
        return;
      }
      await playSamples(ctx, enc.samples);
      await playSamples(ctx, gap);
    }
    log(`cycle ${cycle + 1} sent`);
  }
};
