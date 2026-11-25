/**
 * AudioWorkletProcessor for microphone capture.
 *
 * Receives 128-sample blocks from the input (browser AudioContext) and posts
 * each block to the main thread via postMessage. The main thread receives blocks
 * via port.onmessage and passes them to the protocol layer for decoding.
 */

// TypeScript DOM lib does not include AudioWorkletProcessor and registerProcessor.
// Declare them here so this worklet file type-checks.
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/**
 * Wail mic processor: copies input samples and posts them to the main thread.
 */
class WailMicProcessor extends AudioWorkletProcessor {
  /**
   * Process one audio block (128 Float32 samples from input).
   *
   * The browser reuses the input buffer, so we must copy the samples before posting.
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    // inputs[0] is the input channel; inputs[0]?.[0] is the first (and only) channel's samples.
    // Always 128 Float32 samples per block at the AudioContext's sample rate.
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    // Copy the samples (the browser reuses the buffer on the next block).
    const copy = new Float32Array(channel);

    // Post the copy to the main thread. Transfer the buffer to avoid a copy.
    this.port.postMessage(copy, [copy.buffer]);

    return true;
  }
}

registerProcessor('wail-mic', WailMicProcessor);

// Make this a module so TypeScript treats it as such.
export {};
