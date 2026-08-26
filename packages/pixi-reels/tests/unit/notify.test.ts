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

  it('warns when slamStop() lands before a result exists', async () => {
    const h = createTestReelSet({ reels: 3, visibleCells: 3, symbolIds: ['a', 'b', 'c'] });
    const pump = setInterval(() => h.ticker.tick(16), 16);
    const p = h.reelSet.spin();

    // No setResult: the reels have nothing to land on, so this is the case the
    // notice exists for.
    h.reelSet.slamStop();
    await p;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('slam-before-result');
    expect(String(warn.mock.calls[0][0])).toContain('requestSkip()');

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
