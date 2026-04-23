import { Texture } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { AnimatedSpriteSymbol } from '../../src/index.js';

function mkTex(): Texture {
  // EMPTY is a 1x1 transparent texture safe to use in headless tests.
  return Texture.EMPTY;
}

describe('AnimatedSpriteSymbol.resize — anchor-aware positioning', () => {
  it('anchor (0,0): sprite sits at (0,0) — top-left of cell', () => {
    const s = new AnimatedSpriteSymbol({
      frames: { a: [mkTex(), mkTex()] },
      anchor: { x: 0, y: 0 },
    });
    s.activate('a');
    s.resize(100, 80);
    const spr = (s as unknown as { _animSprite: { x: number; y: number } })._animSprite;
    expect(spr.x).toBe(0);
    expect(spr.y).toBe(0);
  });

  it('anchor (0.5, 0.5): sprite is centred in the cell', () => {
    const s = new AnimatedSpriteSymbol({
      frames: { a: [mkTex(), mkTex()] },
      anchor: { x: 0.5, y: 0.5 },
    });
    s.activate('a');
    s.resize(100, 80);
    const spr = (s as unknown as { _animSprite: { x: number; y: number } })._animSprite;
    expect(spr.x).toBe(50);
    expect(spr.y).toBe(40);
  });

  it('anchor (1, 1): sprite bottom-right corner is at the cell top-left + cell size (used for right-justify)', () => {
    const s = new AnimatedSpriteSymbol({
      frames: { a: [mkTex()] },
      anchor: { x: 1, y: 1 },
    });
    s.activate('a');
    s.resize(120, 90);
    const spr = (s as unknown as { _animSprite: { x: number; y: number } })._animSprite;
    expect(spr.x).toBe(120);
    expect(spr.y).toBe(90);
  });

  it('resize is idempotent — calling twice with same dims keeps position stable', () => {
    const s = new AnimatedSpriteSymbol({
      frames: { a: [mkTex()] },
      anchor: { x: 0.5, y: 0.5 },
    });
    s.activate('a');
    s.resize(64, 64);
    s.resize(64, 64);
    const spr = (s as unknown as { _animSprite: { x: number; y: number } })._animSprite;
    expect(spr.x).toBe(32);
    expect(spr.y).toBe(32);
  });
});
