/**
 * Audio I/O layer: microphone capture, playback, and analyser.
 *
 * Public barrel export of all audio API functions and types.
 */

export { getAudioContext, resumeAudio } from './audio-context.js';
export { startMic } from './mic-capture.js';
export type { MicError, MicCapture } from './mic-capture.js';
export { playSamples } from './playback.js';
export { createAnalyser } from './analyser.js';
export type { Analyser } from './analyser.js';
