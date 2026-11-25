/**
 * Normalise a passphrase to Unicode NFC and trim leading/trailing whitespace.
 * Returns the normalised passphrase, which may be empty (the caller's responsibility
 * to validate).
 */
export function normalisePassphrase(passphrase: string): string {
  return passphrase.normalize('NFC').trim();
}
