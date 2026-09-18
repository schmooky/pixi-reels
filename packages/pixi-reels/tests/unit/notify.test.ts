/**
 * The console channel: codes, level gating, once-per-code, and the fact that
 * a pre-result `slamStop()` now says something instead of silently landing the
 * reels on random buffer fill.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setLogLevel,
  getLogLevel,
  noticeError,
  noticeWarn,
  noticeWarnOnce,
  noticeInfo,
  onNotice,
  resetNoticesForTest,
} from '../../src/utils/notify.js';
import { createTestReelSet } from '../../src/testing/index.js';

describe('notice channel', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetNoticesForTest();
    setLogLevel('info');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
    info.mockRestore();
    setLogLevel('info');
  });

  it('routes each kind to its own console method, with the code in the text', () => {
    noticeError('boom', 'exploded');
    noticeWarn('careful', 'watch out');
    noticeInfo('fyi', 'just so you know');

    // Keeping the native methods is what preserves devtools filtering and
    // the browser's own warn/error styling.
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('boom');
    expect(String(warn.mock.calls[0][0])).toContain('careful');
  });

  it('gates by level, each level including the ones before it', () => {
    setLogLevel('warn');
    noticeInfo('fyi', 'dropped');
    expect(info).not.toHaveBeenCalled();
    noticeWarn('kept', 'kept');
    expect(warn).toHaveBeenCalledTimes(1);

    setLogLevel('error');
    noticeWarn('now-dropped', 'dropped');
    expect(warn).toHaveBeenCalledTimes(1);
    noticeError('still', 'kept');
    expect(error).toHaveBeenCalledTimes(1);

    setLogLevel('silent');
    noticeError('gone', 'dropped');
    expect(error).toHaveBeenCalledTimes(1);
    expect(getLogLevel()).toBe('silent');
  });

  it('once-per-code fires once, and does not muzzle other codes', () => {
    noticeWarnOnce('same', 'first');
    noticeWarnOnce('same', 'second');
    noticeWarnOnce('other', 'different code');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('passes detail through untouched, so an Error keeps its stack', () => {
    const err = new Error('cause');
    noticeError('with-detail', 'wrapped', err);
    expect(error.mock.calls[0]).toContain(err);
  });

  it('throws, rather than warns, when slamStop() is pressed before a result exists', async () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const pump = setInterval(() => h.ticker.tick(16), 16);
    const p = h.reelSet.spin();

    // No setResult: the reels have nothing to land on. This used to warn with
    // `slam-before-result` and land on random fill; it is a call-site error now.
    expect(() => h.reelSet.slamStop()).toThrow(/before setResult\(\)/);
    expect(warn).not.toHaveBeenCalled();

    h.reelSet.setResult([{ visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }]);
    h.reelSet.slamStop();
    await p;

    clearInterval(pump);
    h.destroy();
  });

  it('stays quiet when slamStop() has a result to land on', async () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const pump = setInterval(() => h.ticker.tick(16), 16);
    const p = h.reelSet.spin();
    h.reelSet.setResult([
      { visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] }, { visible: ['a', 'b', 'c'] },
    ]);
    h.reelSet.slamStop();
    await p;

    expect(warn).not.toHaveBeenCalled();
    clearInterval(pump);
    h.destroy();
  });
});

describe('onNotice', () => {
  it('hands every notice to the listener, whatever the console level, until unsubscribed', () => {
    resetNoticesForTest();
    const got: Array<{ kind: string; code: string; message: string; detail: unknown[] }> = [];
    const off = onNotice((n) => got.push(n));
    setLogLevel('silent');
    const err = new Error('boom');
    noticeWarn('some-code', 'a warning', err, 42);
    noticeInfo('other-code', 'an info');
    expect(got).toEqual([
      { kind: 'warn', code: 'some-code', message: 'a warning', detail: [err, 42] },
      { kind: 'info', code: 'other-code', message: 'an info', detail: [] },
    ]);
    // once-per-code holds for listeners too
    noticeWarnOnce('once-code', 'first');
    noticeWarnOnce('once-code', 'second');
    expect(got.filter((n) => n.code === 'once-code')).toHaveLength(1);
    off();
    noticeError('after', 'not heard');
    expect(got.some((n) => n.code === 'after')).toBe(false);
    setLogLevel('info');
  });
});
