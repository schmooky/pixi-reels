/**
 * Re-skinning cells in place: out, swap, in.
 *
 * `setSymbolAt` already swapped an identity, but instantly - so every game
 * doing a mystery reveal or an upgrade hand-rolled the same ordering, stagger,
 * zIndex bump and abort handling around it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

function makeHarness() {
  const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
  return h;
}

const CELLS = [0, 1, 2].map((cell) => ({ reel: 1, cell, id: 'c' }));

describe('swapSymbols', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it('lands the new identities and leaves the cells visible', async () => {
    const h = (harness = makeHarness());
    await h.reelSet.swapSymbols(CELLS);

    const reel = h.reelSet.reels[1];
    for (const cell of [0, 1, 2]) {
      const sym = reel.getSymbolAt(cell)!;
      expect(sym.symbolId).toBe('c');
      expect(sym.view.alpha).toBe(1);
      // The entrance must not leave a shrunken pose behind for the pool.
      expect(sym.view.scale.x).toBe(1);
    }
  });

  it('runs out, then the swap, then in - and the board is empty in between', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[1];
    let idAtSwap = '';
    let alphaAtSwap = -1;

    await h.reelSet.swapSymbols(CELLS, {
      onSwapped: () => {
        const sym = reel.getSymbolAt(0)!;
        idAtSwap = sym.symbolId;
        alphaAtSwap = sym.view.alpha;
      },
    });

    // The identity is already the new one at the midpoint...
    expect(idAtSwap).toBe('c');
    // ...but it has not arrived yet. Without this the new art pops for a frame
    // before the entrance starts, because `activate()` resets alpha to 1.
    expect(alphaAtSwap).toBe(0);
  });

  it('skips the out beat on request and still swaps', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[1];
    // The initial fill is random over the registered ids, so pin the cell first.
    h.reelSet.setSymbolAt(1, 0, 'a');
    await h.reelSet.swapSymbols(CELLS, { skipOut: true });
    expect(reel.getSymbolAt(0)!.symbolId).toBe('c');
  });

  it('leaves the new symbols hidden under skipIn, for the caller to reveal', async () => {
    const h = (harness = makeHarness());
    await h.reelSet.swapSymbols(CELLS, { skipIn: true });
    const sym = h.reelSet.reels[1].getSymbolAt(0)!;
    expect(sym.symbolId).toBe('c');
    expect(sym.view.alpha).toBe(0);
  });

  it('still performs the swap when aborted, rather than leaving the board half-changed', async () => {
    const h = (harness = makeHarness());
    const controller = new AbortController();
    controller.abort();

    await h.reelSet.swapSymbols(CELLS, { signal: controller.signal, holdMs: 5000 });

    const reel = h.reelSet.reels[1];
    for (const cell of [0, 1, 2]) {
      const sym = reel.getSymbolAt(cell)!;
      expect(sym.symbolId).toBe('c');
      // Abort means "skip the animation", so the cells arrive rather than
      // staying hidden - the result the server sent is on screen either way.
      expect(sym.view.alpha).toBe(1);
    }
  });

  it('does not leave the promoted zIndex behind', async () => {
    const h = (harness = makeHarness());
    const reel = h.reelSet.reels[1];
    await h.reelSet.swapSymbols(CELLS);
    // The bump exists so an overshooting entrance is not clipped; it must not
    // survive the call, or every revealed cell outranks the board forever.
    expect(reel.getSymbolAt(0)!.view.zIndex).not.toBe(1000);
  });

  it('leaves a caller-promoted symbol at its own zIndex when nothing is swapped away', async () => {
    const h = (harness = makeHarness());
    const sym = h.reelSet.reels[0].getSymbolAt(0)!;
    sym.view.zIndex = 7;
    await sym.playOut();
    expect(sym.view.zIndex).toBe(7);
  });

  it('validates every cell before animating anything', async () => {
    const h = (harness = makeHarness());
    await expect(
      h.reelSet.swapSymbols([
        { reel: 1, cell: 0, id: 'c' },
        { reel: 9, cell: 0, id: 'c' },
      ]),
    ).rejects.toThrow(/reel 9 out of range/);
    // Nothing animated: the legal cell is untouched, still holding whatever the
    // initial fill gave it rather than a half-applied swap.
    expect(h.reelSet.reels[1].getSymbolAt(0)!.view.alpha).toBe(1);
  });

  it('is a no-op for an empty list', async () => {
    const h = (harness = makeHarness());
    await expect(h.reelSet.swapSymbols([])).resolves.toBeUndefined();
  });
});

describe('playIn / playOut', () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it('playOut leaves the symbol hidden at a resting scale', async () => {
    const h = (harness = makeHarness());
    const sym = h.reelSet.reels[0].getSymbolAt(0)!;
    await sym.playOut();
    expect(sym.view.alpha).toBe(0);
    // Hidden is still a legal resting pose, or pool reuse inherits the shrink.
    expect(sym.view.scale.x).toBe(1);
  });

  it('playIn arrives from nothing even when the view starts visible', async () => {
    const h = (harness = makeHarness());
    const sym = h.reelSet.reels[0].getSymbolAt(0)!;
    expect(sym.view.alpha).toBe(1);
    await sym.playIn();
    expect(sym.view.alpha).toBe(1);
    expect(sym.view.scale.x).toBe(1);
  });

  it('an aborted playIn snaps to the arrived pose, not the hidden one', async () => {
    const h = (harness = makeHarness());
    const sym = h.reelSet.reels[0].getSymbolAt(0)!;
    const controller = new AbortController();
    controller.abort();
    await sym.playIn({ signal: controller.signal });
    expect(sym.view.alpha).toBe(1);
    expect(sym.view.scale.x).toBe(1);
  });

  it('restores the pivot it borrowed to centre the scale', async () => {
    const h = (harness = makeHarness());
    const sym = h.reelSet.reels[0].getSymbolAt(0)!;
    const { x, y } = sym.view.pivot;
    await sym.playOut();
    expect(sym.view.pivot.x).toBe(x);
    expect(sym.view.pivot.y).toBe(y);
  });
});
