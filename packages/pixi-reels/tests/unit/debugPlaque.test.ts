/**
 * DebugPlaque: the readout card every info layer and recipe label draws with.
 * It sizes itself from the character count rather than by measuring text, so
 * its geometry is exact and assertable headless.
 */
import { describe, it, expect } from 'vitest';
import { Text } from 'pixi.js';
import { DebugPlaque } from '../../src/debug/DebugPlaque.js';

const texts = (p: DebugPlaque): Text[] =>
  p.children.filter((c): c is Text => c instanceof Text);
const visibleTexts = (p: DebugPlaque): string[] =>
  texts(p).filter((t) => t.visible).map((t) => t.text);

describe('DebugPlaque', () => {
  it('sizes the plate from the longest row and the row count', () => {
    // 10px monospace advances 6px a character; rows are round(10 * 1.4) = 14 tall.
    const p = new DebugPlaque({ rows: ['abcd', 'ab'], fontSize: 10, padding: [5, 4] });
    expect(p.plateWidth).toBe(4 * 6 + 5 * 2);
    expect(p.plateHeight).toBe(2 * 14 + 4 * 2);
    expect(visibleTexts(p)).toEqual(['abcd', 'ab']);
    p.destroy({ children: true });
  });

  it('splits `text` on newlines and puts the title first', () => {
    const p = new DebugPlaque({ title: 'reel 2', text: 'phase stop\nspeed 0.4' });
    expect(visibleTexts(p)).toEqual(['reel 2', 'phase stop', 'speed 0.4']);
    p.destroy({ children: true });
  });

  it('reserves a swatch column and a meter column for every row', () => {
    const plain = new DebugPlaque({ rows: ['spin'], fontSize: 10, padding: 0 });
    const keyed = new DebugPlaque({ rows: [{ text: 'spin', swatch: 0x2563eb, meter: 0.5 }], fontSize: 10, padding: 0 });
    // swatch 8 + gap 5, meter 40 + gap 7.
    expect(keyed.plateWidth - plain.plateWidth).toBe(8 + 5 + 40 + 7);
    const t = texts(keyed)[0];
    expect(t.x).toBe(8 + 5);
    plain.destroy({ children: true });
    keyed.destroy({ children: true });
  });

  it('reuses its texts across updates and hides the rows it no longer has', () => {
    const p = new DebugPlaque({ rows: ['one', 'two', 'three'] });
    const before = texts(p);
    p.update({ rows: ['uno'] });
    expect(texts(p)).toEqual(before);
    expect(visibleTexts(p)).toEqual(['uno']);
    p.setRows(['a', 'b']);
    expect(visibleTexts(p)).toEqual(['a', 'b']);
    p.destroy({ children: true });
  });

  it('puts the anchor point of the plate on its position', () => {
    const p = new DebugPlaque({ text: 'abcdefghij', fontSize: 10, padding: [5, 5], anchor: { x: 0.5, y: 1 } });
    expect(p.pivot.x).toBe(Math.round(p.plateWidth / 2));
    expect(p.pivot.y).toBe(p.plateHeight);
    p.update({ anchor: 0 });
    expect(p.pivot.x).toBe(0);
    expect(p.pivot.y).toBe(0);
    p.destroy({ children: true });
  });

  it('reads and writes its body as one string, like the Text it replaces', () => {
    const p = new DebugPlaque({ rows: ['a', { text: 'b', swatch: 0xff0000 }] });
    expect(p.text).toBe('a\nb');
    p.text = 'held 3/15\nround 2';
    expect(visibleTexts(p)).toEqual(['held 3/15', 'round 2']);
    p.text += '\ndone';
    expect(visibleTexts(p)).toEqual(['held 3/15', 'round 2', 'done']);
    p.destroy({ children: true });
  });

  it('wraps rows at word boundaries to stay inside maxWidth', () => {
    // 10px monospace, no padding: 60px holds exactly ten characters.
    const p = new DebugPlaque({ text: 'one two three four', fontSize: 10, padding: 0, maxWidth: 60 });
    expect(visibleTexts(p)).toEqual(['one two', 'three four']);
    expect(p.plateWidth).toBeLessThanOrEqual(60);
    p.destroy({ children: true });
  });

  it('is hit-testable over the whole plate once made interactive', () => {
    const p = new DebugPlaque({ text: 'tap me', fontSize: 10, padding: 5 });
    expect(p.eventMode).toBe('none');
    expect(p.hitArea?.contains(p.plateWidth - 1, p.plateHeight - 1)).toBe(true);
    p.text = 'tap me, I grew';
    expect(p.hitArea?.contains(p.plateWidth - 1, 1)).toBe(true);
    p.destroy({ children: true });
  });

  it('measures as its plate, not as the blur of its shadow', () => {
    const p = new DebugPlaque({ text: 'bounds', fontSize: 10, padding: 5 });
    const b = p.getLocalBounds();
    expect(b.width).toBe(p.plateWidth);
    expect(b.height).toBe(p.plateHeight);
    p.destroy({ children: true });
  });

  it('keeps reserveRows of height whatever it shows', () => {
    const one = new DebugPlaque({ text: 'press spin', fontSize: 10, padding: 5 });
    const three = new DebugPlaque({ text: 'press spin', fontSize: 10, padding: 5, reserveRows: 3 });
    expect(three.plateHeight - one.plateHeight).toBe(2 * 14);
    three.text = 'a\nb\nc';
    expect(three.plateHeight).toBe(3 * 14 + 10);
    one.destroy({ children: true });
    three.destroy({ children: true });
  });

  it('a plain destroy() frees its plate and text too, and a second one does nothing', () => {
    const p = new DebugPlaque({ title: 'reel 2', rows: ['phase stop', 'speed 0.4'] });
    const owned = [...p.children];
    expect(owned.length).toBeGreaterThan(1);
    p.destroy();
    expect(p.isDestroyed).toBe(true);
    expect(owned.every((c) => c.destroyed)).toBe(true);
    expect(() => p.destroy()).not.toThrow();
  });

  it('ignores a write that arrives after it was destroyed, like a Text', () => {
    const p = new DebugPlaque({ text: 'round 1' });
    p.destroy({ children: true });
    expect(() => { p.text = 'round 2'; }).not.toThrow();
    expect(() => p.update({ color: 0xff0000 })).not.toThrow();
  });

  it('never goes narrower than minWidth', () => {
    const p = new DebugPlaque({ text: 'x', minWidth: 120 });
    expect(p.plateWidth).toBe(120);
    p.destroy({ children: true });
  });
});
