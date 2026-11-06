/**
 * crispText: a debug label re-rasterises at the scale it is drawn, so a
 * plaque inside a zoomed container stays as sharp as its vector plate.
 */
import { describe, it, expect } from 'vitest';
import { Container, Text, type Renderer } from 'pixi.js';
import { crispText } from '../../src/debug/crispText.js';
import { DebugPlaque } from '../../src/debug/DebugPlaque.js';

const renderer = (resolution: number) => ({ resolution }) as unknown as Renderer;

function labelIn(scale: number): { root: Container; text: Text } {
  const root = new Container();
  root.scale.set(scale);
  const text = new Text({ text: 'reel 0' });
  root.addChild(text);
  crispText(text);
  return { root, text };
}

describe('crispText', () => {
  it('rasterises at the on-screen scale times the renderer resolution', () => {
    const { root, text } = labelIn(3);
    text.onRender!(renderer(2));
    expect(text.resolution).toBe(6);
    root.destroy({ children: true });
  });

  it('rounds up to a half step and never drops below 1', () => {
    const { root, text } = labelIn(0.3);
    text.onRender!(renderer(1));
    expect(text.resolution).toBe(1);
    root.scale.set(1.2);
    text.onRender!(renderer(1));
    expect(text.resolution).toBe(1.5);
    root.destroy({ children: true });
  });

  it('caps the resolution on a deep zoom', () => {
    const { root, text } = labelIn(40);
    text.onRender!(renderer(2));
    expect(text.resolution).toBe(8);
    root.destroy({ children: true });
  });

  it('is on every DebugPlaque row', () => {
    const p = new DebugPlaque({ rows: ['a', 'b'] });
    const rows = p.children.filter((c): c is Text => c instanceof Text);
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) expect(typeof t.onRender).toBe('function');
    p.destroy({ children: true });
  });
});
