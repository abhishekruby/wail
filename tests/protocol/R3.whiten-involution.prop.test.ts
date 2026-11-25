/**
 * Property 1: Whitening Involution
 *
 * For any Uint8Array and any salt in [0, 255], applying whiten() twice with
 * the same salt returns a byte sequence equal to the original.
 *
 * Validates: Requirement 2.6
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { whiten } from '../../src/protocol/whiten.js';

describe('whiten', () => {
  it('involution: whiten(whiten(x, salt), salt) === x', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }),
        fc.integer({ min: 0, max: 255 }),
        (bytes, salt) => {
          const whitened = whiten(bytes, salt);
          const restored = whiten(whitened, salt);
          expect(restored).toEqual(bytes);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
