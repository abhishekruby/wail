/**
 * Property 10: Manifest round-trip
 *
 * For any valid ManifestBody (plain or locked),
 * parseManifest(serializeManifest(body)) returns { ok: true, value }
 * where all fields equal the original.
 *
 * Validates: Requirements 8.3, 8.2
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { serializeManifest, parseManifest } from '../../src/protocol/manifest.js';
import type { PlainManifestBody, LockedManifestBody } from '../../src/protocol/types.js';

describe('R8: Manifest round-trip (Property 10)', () => {
  it('plain manifest serialises and parses to identical fields', () => {
    const arbPlainManifest = fc.record<PlainManifestBody>({
      totalFrames: fc.integer({ min: 0, max: 255 }),
      kind: fc.integer({ min: 0, max: 4 }) as fc.Arbitrary<0 | 1 | 2 | 3 | 4>,
      flags: fc.record({
        compressed: fc.boolean(),
        locked: fc.constant(false),
        broadcast: fc.boolean(),
      }),
      payloadLen: fc.integer({ min: 0, max: 65535 }),
      crc32: fc.integer({ min: 0, max: 0xffffffff }),
    });

    fc.assert(
      fc.property(arbPlainManifest, (original: PlainManifestBody) => {
        const serialised = serializeManifest(original);
        const parsed = parseManifest(serialised);

        // Should parse successfully
        if (!parsed.ok) {
          throw new Error(`Parse failed for plain manifest: ${parsed.error}`);
        }

        const value = parsed.value as PlainManifestBody;

        // All fields should match
        if (value.totalFrames !== original.totalFrames) {
          throw new Error(
            `totalFrames mismatch: ${value.totalFrames} vs ${original.totalFrames}`
          );
        }
        if (value.kind !== original.kind) {
          throw new Error(`kind mismatch: ${value.kind} vs ${original.kind}`);
        }
        if (value.payloadLen !== original.payloadLen) {
          throw new Error(
            `payloadLen mismatch: ${value.payloadLen} vs ${original.payloadLen}`
          );
        }
        if (value.crc32 !== original.crc32) {
          throw new Error(`crc32 mismatch: ${value.crc32} vs ${original.crc32}`);
        }
        if (
          value.flags.compressed !== original.flags.compressed ||
          value.flags.locked !== original.flags.locked ||
          value.flags.broadcast !== original.flags.broadcast
        ) {
          throw new Error('flags mismatch');
        }

        // Ensure it's not marked as locked
        if ('encSalt' in value || 'iv' in value) {
          throw new Error('Plain manifest should not have encSalt or iv');
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('locked manifest serialises and parses to identical fields', () => {
    const arbLockedManifest = fc.record<LockedManifestBody>({
      totalFrames: fc.integer({ min: 0, max: 255 }),
      kind: fc.integer({ min: 0, max: 4 }) as fc.Arbitrary<0 | 1 | 2 | 3 | 4>,
      flags: fc.record({
        compressed: fc.boolean(),
        locked: fc.constant(true),
        broadcast: fc.boolean(),
      }),
      payloadLen: fc.integer({ min: 0, max: 65535 }),
      crc32: fc.integer({ min: 0, max: 0xffffffff }),
      encSalt: fc.uint8Array({ minLength: 16, maxLength: 16 }),
      iv: fc.uint8Array({ minLength: 12, maxLength: 12 }),
    });

    fc.assert(
      fc.property(arbLockedManifest, (original: LockedManifestBody) => {
        const serialised = serializeManifest(original);
        const parsed = parseManifest(serialised);

        // Should parse successfully
        if (!parsed.ok) {
          throw new Error(`Parse failed for locked manifest: ${parsed.error}`);
        }

        const value = parsed.value as LockedManifestBody;

        // All fields should match
        if (value.totalFrames !== original.totalFrames) {
          throw new Error(
            `totalFrames mismatch: ${value.totalFrames} vs ${original.totalFrames}`
          );
        }
        if (value.kind !== original.kind) {
          throw new Error(`kind mismatch: ${value.kind} vs ${original.kind}`);
        }
        if (value.payloadLen !== original.payloadLen) {
          throw new Error(
            `payloadLen mismatch: ${value.payloadLen} vs ${original.payloadLen}`
          );
        }
        if (value.crc32 !== original.crc32) {
          throw new Error(`crc32 mismatch: ${value.crc32} vs ${original.crc32}`);
        }
        if (
          value.flags.compressed !== original.flags.compressed ||
          value.flags.locked !== original.flags.locked ||
          value.flags.broadcast !== original.flags.broadcast
        ) {
          throw new Error('flags mismatch');
        }

        // Check encSalt
        if (!value.encSalt || value.encSalt.length !== 16) {
          throw new Error('encSalt length mismatch');
        }
        for (let i = 0; i < 16; i++) {
          if (value.encSalt[i] !== original.encSalt[i]) {
            throw new Error(`encSalt[${i}] mismatch`);
          }
        }

        // Check iv
        if (!value.iv || value.iv.length !== 12) {
          throw new Error('iv length mismatch');
        }
        for (let i = 0; i < 12; i++) {
          if (value.iv[i] !== original.iv[i]) {
            throw new Error(`iv[${i}] mismatch`);
          }
        }
      }),
      { numRuns: 1000 }
    );
  });
});
