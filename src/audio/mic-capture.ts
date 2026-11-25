/**
 * Microphone capture via getUserMedia and AudioWorklet.
 *
 * Starts the mic capture chain: getUserMedia → MediaStreamAudioSourceNode →
 * AudioWorkletNode → postMessage blocks to main thread. The main thread calls
 * the onBlock callback with each received block.
 *
 * Stop the capture by calling micCapture.stop(), which disconnects both nodes,
 * clears the message listener, and stops all tracks (R10).
 */

import workletUrl from './mic-worklet.ts?worker&url';

/**
 * Error returned by startMic when getUserMedia fails.
 *
 * Code indicates the type of failure:
 * - 'denied': User denied permission (NotAllowedError)
 * - 'no-mic': No microphone device found (NotFoundError)
 * - 'busy': Microphone already in use (NotReadableError)
 * - 'unknown': Other error
 */
export interface MicError extends Error {
  code: 'denied' | 'no-mic' | 'busy' | 'unknown';
}

/**
 * Handle returned by startMic.
 */
export interface MicCapture {
  stop(): void;
}

/**
 * Start microphone capture.
 *
 * Loads the worklet, requests microphone access with specific constraints
 * (voice processing disabled), and sets up the AudioWorklet chain. Each 128-sample
 * block from the microphone is copied and posted to the main thread, triggering
 * the onBlock callback.
 *
 * @param ctx - The AudioContext from getAudioContext() (must be resumed first).
 * @param onBlock - Callback invoked with each received Float32Array block (128 samples).
 * @returns A promise that resolves to a MicCapture handle with stop() method.
 * @throws MicError if getUserMedia fails or the worklet fails to load.
 *
 * @example
 * ```ts
 * const ctx = getAudioContext();
 * await resumeAudio();
 * const micCapture = await startMic(ctx, (samples) => {
 *   const decoded = modem.feed(samples);
 *   console.log('Decoded frames:', decoded);
 * });
 * // ... later ...
 * micCapture.stop();
 * ```
 */
export async function startMic(
  ctx: AudioContext,
  onBlock: (samples: Float32Array) => void,
): Promise<MicCapture> {
  // Request microphone access with specific constraints: voice processing disabled
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (err) {
    // Rethrow getUserMedia errors as MicError with semantic code
    const micError = new Error((err as Error).message) as MicError;

    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        micError.code = 'denied';
      } else if (err.name === 'NotFoundError') {
        micError.code = 'no-mic';
      } else if (err.name === 'NotReadableError') {
        micError.code = 'busy';
      } else {
        micError.code = 'unknown';
      }
    } else {
      micError.code = 'unknown';
    }

    throw micError;
  }

  // Create MediaStreamAudioSourceNode from the stream
  const sourceNode = ctx.createMediaStreamSource(stream);

  // Load the worklet module
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (err) {
    for (const track of stream.getAudioTracks()) {
      track.stop();
    }
    throw err;
  }

  // Create AudioWorkletNode (register as 'wail-mic' in the worklet)
  let workletNode: AudioWorkletNode;
  try {
    workletNode = new AudioWorkletNode(ctx, 'wail-mic');
  } catch (err) {
    for (const track of stream.getAudioTracks()) {
      track.stop();
    }
    throw err;
  }

  // Connect source → worklet. Do NOT connect worklet to destination (no echo).
  sourceNode.connect(workletNode);

  // Set up message listener: when the worklet posts a block, call onBlock
  workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onBlock(event.data);
  };

  // Return a handle to stop the capture
  return {
    stop() {
      workletNode.disconnect();
      sourceNode.disconnect();
      workletNode.port.onmessage = null;
      for (const track of stream.getAudioTracks()) {
        track.stop();
      }
    },
  };
}
