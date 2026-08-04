import { describe, it, expect } from 'vitest';
import { StopSequencer } from '../../src/core/StopSequencer.js';

describe('StopSequencer', () => {
  it('delivers symbols from the end of the frame first', () => {
    // Frame is loaded top-to-bottom; symbols are inserted at the reel's TOP
    // as it scrolls down, so the last frame symbol is delivered first.
    const seq = new StopSequencer();
    seq.setFrame(['top', 'middle', 'bottom']);
    expect(seq.next()).toBe('bottom');
    expect(seq.next()).toBe('middle');
    expect(seq.next()).toBe('top');
  });

  it('tracks remaining correctly', () => {
    const seq = new StopSequencer();
    seq.setFrame(['a', 'b', 'c']);
    expect(seq.remaining).toBe(3);
    seq.next();
    expect(seq.remaining).toBe(2);
    seq.next();
    expect(seq.remaining).toBe(1);
    seq.next();
    expect(seq.remaining).toBe(0);
  });

  it('hasRemaining is false when exhausted', () => {
    const seq = new StopSequencer();
    seq.setFrame(['a']);
    expect(seq.hasRemaining).toBe(true);
    seq.next();
    expect(seq.hasRemaining).toBe(false);
  });

  it('throws when consumed past the end of the frame', () => {
    const seq = new StopSequencer();
    seq.setFrame(['a', 'b']);
    seq.next();
    seq.next();
    expect(() => seq.next()).toThrow(/frame exhausted/);
  });

  it('throws on next() before any frame is loaded', () => {
    expect(() => new StopSequencer().next()).toThrow(/frame exhausted/);
  });

  it('reset clears state', () => {
    const seq = new StopSequencer();
    seq.setFrame(['a', 'b']);
    seq.next();
    seq.reset();
    expect(seq.remaining).toBe(0);
    expect(seq.hasRemaining).toBe(false);
  });

  // NOTE: `reset()` also restores `_cursor`/`_step`, but that half is state
  // hygiene with no reachable behaviour: `setFrame()` writes both fields
  // unconditionally, and `next()` throws while `_remaining` is 0. There is no
  // public-surface assertion that can fail without it, so none is written here
  // rather than a test that passes either way.
});
