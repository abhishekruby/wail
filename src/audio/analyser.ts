/**
 * Analyser node for spectrum display.
 *
 * Creates an AnalyserNode connected to a source and ctx.destination.
 * Provides a read() function to get the byte-frequency data for display.
 */

/**
 * Result of createAnalyser.
 */
export interface Analyser {
  /** The AnalyserNode (for connection to sources). */
  node: AnalyserNode;
  /** Read the byte-frequency data into a Uint8Array (for display). */
  read(into: Uint8Array<ArrayBuffer>): void;
}

/**
 * Create an analyser node for spectrum display.
 *
 * Connects the source to the analyser, and the analyser to ctx.destination.
 * Configure: fftSize = 2048, smoothingTimeConstant = 0 (no smoothing).
 *
 * @param ctx - The AudioContext from getAudioContext().
 * @param source - The AudioNode to analyse (e.g., microphone, playback, mix).
 * @returns An object with the AnalyserNode and a read() function.
 *
 * @example
 * ```ts
 * const analyser = createAnalyser(ctx, sourceNode);
 * const data = new Uint8Array(analyser.node.frequencyBinCount);
 * analyser.read(data);
 * // data now contains byte-frequency bins [0, 255]
 * ```
 */
export function createAnalyser(ctx: AudioContext, source: AudioNode): Analyser {
  const node = ctx.createAnalyser();
  node.fftSize = 2048;
  node.smoothingTimeConstant = 0;

  // Connect: source → analyser (read only, no output to speakers)
  source.connect(node);

  return {
    node,
    read(into: Uint8Array<ArrayBuffer>): void {
      node.getByteFrequencyData(into);
    },
  };
}
