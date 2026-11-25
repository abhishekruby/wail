/**
 * Barrel export for the modem layer.
 *
 * Public API:
 * - Modem interface (type-safe abstraction)
 * - GgwaveModem (production implementation)
 * - PassthroughModem (test double)
 * - Configuration types and validation
 */

export type { Modem, EncodeAudioResult } from './modem.js';
export { GgwaveModem } from './ggwave-modem.js';
export type { GgwaveModemConfig } from './ggwave-modem.js';
export { PassthroughModem } from './passthrough-modem.js';
export { validateModemConfig, DEFAULT_MODEM_CONFIG } from './modem-config.js';
export type { ModemConfig, ValidResult } from './modem-config.js';
