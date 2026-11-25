/**
 * Audio playback via AudioBufferSourceNode.
 *
 * Takes a Float32Array of samples and plays them on the specified AudioContext.
 * The function returns a promise that resolves when the audio has finished playing.
 */

/**
 * Play audio samples via an AudioBufferSourceNode.
 *
 * Creates an AudioBuffer, copies the samples into it, connects to ctx.destination,
 * and returns a promise that resolves when playback ends.
 *
 * @param ctx - The AudioContext from getAudioContext() (must be resumed first).
 * @param samples - Float32Array of PCM audio (amplitude [−1, +1]) at ctx.sampleRate.
 * @returns A promise that resolves when playback completes.
 *
 * @example
 * ```ts
 * const ctx = getAudioContext();
 * await resumeAudio();
 * const encoded = modem.encode(frame);
 * if (encoded.ok) {
 *   await playSamples(ctx, encoded.samples);
 *   console.log('Frame played');
 * }
 * ```
 */
export async function playSamples(ctx: AudioContext, samples: Float32Array): Promise<void> {
  // Create an AudioBuffer: 1 channel, samples.length frames, at ctx.sampleRate
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);

  // Copy samples into the buffer (channel 0)
  buffer.getChannelData(0).set(samples);

  // Create and play the source
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  // Return a promise that resolves when playback ends
  return new Promise<void>((resolve) => {
    source.onended = () => {
      resolve();
    };
    source.start(0);
  });
}
