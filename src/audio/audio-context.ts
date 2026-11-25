/**
 * Shared AudioContext singleton.
 *
 * The AudioContext is created once and cached. Callers must call resumeAudio()
 * from a user tap (to comply with autoplay policies) before using it for playback.
 *
 * Always read ctx.sampleRate after resuming audio — iOS may return 44,100 instead
 * of the requested 48,000 — and pass it to GgwaveModem.create().
 */

let audioContext: AudioContext | undefined;

/**
 * Get the shared AudioContext instance.
 *
 * Creates a new AudioContext on first call, requesting 48 kHz. If the browser
 * does not support the requested sample rate, it may return a different rate
 * (e.g., 44,100 on iOS). Callers must read ctx.sampleRate and handle the actual rate.
 *
 * @returns The shared AudioContext instance (may be in 'suspended' or 'running' state).
 */
export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 48000 });
  }
  return audioContext;
}

/**
 * Resume the AudioContext from suspended state.
 *
 * Must be called from a user tap (click, touch, etc.) to comply with browser autoplay
 * policies. After resuming, the context is in the 'running' state and can be used
 * for playback.
 *
 * @returns A promise that resolves when the context is running.
 */
export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}
