/**
 * Stopping a win settles it. `stopAnimation()` runs whenever a symbol leaves
 * its cell mid-win (a recycle, a spotlight hide, `removeReels()` taking its
 * reel away), and a `playWin()` promise it leaves pending hangs whoever awaits
 * it, `WinPresenter.show()` included. A timeline callback it leaves armed
 * fires into a symbol that has moved on, or been destroyed.
 */
import { describe, it, expect } from 'vitest';
import { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { CardSymbol } from '../../src/symbols/CardSymbol.js';
import { SpriteSymbol } from '../../src/symbols/SpriteSymbol.js';

/** Tweens, timelines and delayed calls gsap is still running. */
const running = (): number => gsap.globalTimeline.getChildren(true, true, true).length;

describe('stopAnimation() ends a win', () => {
  it('CardSymbol settles playWin and leaves no timeline or call armed', async () => {
    const card = new CardSymbol({ color: 0xc0392b, label: 'A' });
    card.activate('a');
    card.resize(80, 80);
    const before = running();
    const win = card.playWin();
    expect(running()).toBeGreaterThan(before);

    card.stopAnimation();
    await expect(win).resolves.toBeUndefined();
    expect(running()).toBe(before);
    card.destroy();
  });

  it('CardSymbol: a second playWin settles the first', async () => {
    const card = new CardSymbol({ color: 0xc0392b, label: 'A' });
    card.activate('a');
    card.resize(80, 80);
    const first = card.playWin();
    const second = card.playWin();
    await expect(first).resolves.toBeUndefined();
    card.stopAnimation();
    await expect(second).resolves.toBeUndefined();
    card.destroy();
  });

  it('SpriteSymbol settles playWin when its tween is killed', async () => {
    const sprite = new SpriteSymbol({ textures: { a: Texture.WHITE } });
    sprite.activate('a');
    sprite.resize(80, 80);
    const win = sprite.playWin();
    sprite.stopAnimation();
    await expect(win).resolves.toBeUndefined();
    sprite.destroy();
  });
});
