/**
 * Low finding — SpineSymbol's optional import is fire-and-forget, so a cold-load
 * construction could throw a misleading "not installed" error. whenSpineReady()
 * lets callers await the import settling. It must always resolve (never reject),
 * whether or not the optional peer dep is installed.
 */
import { describe, it, expect } from 'vitest';
import { whenSpineReady } from '../../src/symbols/SpineSymbol.js';

describe('whenSpineReady', () => {
  it('resolves once the optional Spine import settles', async () => {
    await expect(whenSpineReady()).resolves.toBeUndefined();
  });
});
