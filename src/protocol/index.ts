export { MAX_FRAME, MIN_FRAME } from './constants.js';
export { whiten } from './whiten.js';
export { crc16 } from './crc16.js';
export { crc32 } from './crc32.js';
export { buildFrame, resaltFrame } from './frame-encoder.js';
export { decodeFrame } from './frame-decoder.js';
export { serializeManifest, parseManifest } from './manifest.js';
export { splitPayload } from './splitter.js';
export { createReassembler } from './reassembler.js';
export { ReplayGuard } from './replay-guard.js';
export type {
  FrameFields,
  EncoderOptions,
  EncodeResult,
  RngSource,
  DecodedFrame,
  ManifestFrame,
  DataFrame,
  RepairRequestFrame,
  ManifestBody,
  PlainManifestBody,
  LockedManifestBody,
  ManifestFlags,
  FrameKind,
  ManifestParseResult,
  SplitOptions,
  SplitResult,
  ReassemblerOptions,
  ReassemblyResult,
} from './types.js';
