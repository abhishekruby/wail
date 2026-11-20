// Minimal types for the parts of ggwave 0.4.0 that Wail uses.
// Source of truth: emscripten.cpp in the ggwave npm package.
declare module 'ggwave' {
  export interface GgwaveParameters {
    payloadLength: number;
    sampleRateInp: number;
    sampleRateOut: number;
    sampleRate: number;
    samplesPerFrame: number;
    soundMarkerThreshold: number;
    sampleFormatInp: unknown;
    sampleFormatOut: unknown;
    operatingMode: number;
  }
  export type GgwaveInstance = number;
  export type GgwaveProtocol = { value: number };
  export interface Ggwave {
    getDefaultParameters(): GgwaveParameters;
    init(p: GgwaveParameters): GgwaveInstance;
    free(i: GgwaveInstance): void;
    /** Returns an Int8Array view (into WASM memory) of float32 samples. Copy it before the next call. Max 140 payload bytes; longer input is silently truncated. */
    encode(i: GgwaveInstance, data: Uint8Array, protocol: GgwaveProtocol, volume: number): Int8Array;
    /** Feed raw float32 samples as bytes. Returns the payload when a full transmission decodes, else an empty view. */
    decode(i: GgwaveInstance, samples: Int8Array): Int8Array;
    disableLog(): void;
    ProtocolId: Record<
      'GGWAVE_PROTOCOL_AUDIBLE_NORMAL' | 'GGWAVE_PROTOCOL_AUDIBLE_FAST' | 'GGWAVE_PROTOCOL_AUDIBLE_FASTEST',
      GgwaveProtocol
    >;
  }
  const factory: () => Promise<Ggwave>;
  export default factory;
}
