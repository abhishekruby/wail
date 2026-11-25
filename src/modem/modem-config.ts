/**
 * Modem configuration: speed and volume settings with type-safe validation.
 *
 * Speed: 'normal' or 'fast' (ggwave protocol selection).
 * Volume: 1–100 (controls amplitude of encoded waveform).
 * Sample rate: typically 48,000 or 44,100 Hz (passed once at modem creation, never changes).
 * Call mode: reserved for future research; not implemented in this spec.
 */

/**
 * Modem configuration with speed, volume, and sample rate.
 *
 * @property speed - Modulation speed: 'normal' or 'fast'. Maps to ggwave protocol IDs.
 * @property volume - Amplitude scaling: integer in [1, 100]. Default is 10 (quiet).
 * @property sampleRate - PCM sample rate: typically 48,000 or 44,100 Hz. Positive integer.
 * @property callMode - Reserved for future research. NOT implemented in this spec.
 *                     TODO: Call mode `DT_FASTEST` at volume 50 is reserved for research
 *                     on narrowband call channels (WhatsApp, Telegram, etc.).
 *                     Not used for room broadcast (fails at RT60 0.5 s).
 *                     To implement: add conditional logic in GgwaveModem to set
 *                     protocolId = GGWAVE_PROTOCOL_DT_FASTEST and enforce volume = 50.
 */
export interface ModemConfig {
  speed: 'normal' | 'fast';
  volume: number;
  sampleRate: number;
  callMode?: 'dt-fastest';
}

/**
 * Result of configuration validation.
 *
 * Success: { ok: true }
 * Failure: { ok: false; error: string } with one of:
 *   - 'invalid-speed' if speed not in {'normal', 'fast'}
 *   - 'invalid-volume' if volume not in [1, 100] or not an integer
 *   - 'invalid-sample-rate' if sampleRate <= 0 or not an integer
 */
export type ValidResult = { ok: true } | { ok: false; error: string };

/**
 * Validate modem configuration.
 *
 * @param config - The configuration to validate.
 * @returns { ok: true } if all fields are valid.
 * @returns { ok: false; error: ... } on the first validation failure.
 *
 * Never throws; all validation is synchronous.
 */
export function validateModemConfig(config: ModemConfig): ValidResult {
  // Validate speed
  if (config.speed !== 'normal' && config.speed !== 'fast') {
    return { ok: false, error: 'invalid-speed' };
  }

  // Validate volume: must be an integer in [1, 100]
  if (!Number.isInteger(config.volume) || config.volume < 1 || config.volume > 100) {
    return { ok: false, error: 'invalid-volume' };
  }

  // Validate sample rate: must be a positive integer
  if (!Number.isInteger(config.sampleRate) || config.sampleRate <= 0) {
    return { ok: false, error: 'invalid-sample-rate' };
  }

  // callMode is reserved; do not validate it (would go here if implemented)

  return { ok: true };
}

/**
 * Default modem configuration.
 *
 * Speed: 'fast' (default for room broadcast; see steering/protocol.md)
 * Volume: 10 (quiet)
 * Sample rate: 48,000 Hz (Android Chrome standard)
 */
export const DEFAULT_MODEM_CONFIG: Readonly<ModemConfig> = {
  speed: 'fast',
  volume: 10,
  sampleRate: 48000,
};
