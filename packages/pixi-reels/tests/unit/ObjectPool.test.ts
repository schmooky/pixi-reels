import { describe, it, expect, vi } from 'vitest';
import { ObjectPool } from '../../src/pool/ObjectPool.js';

describe('ObjectPool', () => {
  it('creates new items via factory', () => {
    const factory = vi.fn((key: string) => ({ key }));
    const pool = new ObjectPool(factory);
    const item = pool.acquire('test');
    expect(item).toEqual({ key: 'test' });
    expect(factory).toHaveBeenCalledWith('test');
  });

  it('reuses released items', () => {
    const factory = vi.fn((key: string) => ({ key, id: Math.random() }));
    const pool = new ObjectPool(factory);
    const item1 = pool.acquire('test');
    pool.release('test', item1);
    const item2 = pool.acquire('test');
    expect(item2).toBe(item1);
    expect(factory).toHaveBeenCalledTimes(1); // Not called again
  });

  it('calls reset on reuse', () => {
    const reset = vi.fn();
    const pool = new ObjectPool((k) => ({ k }), reset);
    const item = pool.acquire('a');
    pool.release('a', item);
    pool.acquire('a');
    expect(reset).toHaveBeenCalledWith(item);
  });

  it('respects max pool size', () => {
    const dispose = vi.fn();
    const pool = new ObjectPool((k) => ({ k }), undefined, dispose, 2);
    const items = [pool.acquire('a'), pool.acquire('a'), pool.acquire('a')];
    for (const item of items) {
      pool.release('a', item);
    }
    // 3rd item should be disposed since max is 2
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pool.size('a')).toBe(2);
  });

  it('tracks total size', () => {
    const pool = new ObjectPool((k) => ({ k }));
    pool.release('a', pool.acquire('a'));
    pool.release('b', pool.acquire('b'));
    expect(pool.totalSize).toBe(2);
  });

  it('clear disposes all items', () => {
    const dispose = vi.fn();
    const pool = new ObjectPool((k) => ({ k }), undefined, dispose);
    pool.release('a', pool.acquire('a'));
    pool.release('b', pool.acquire('b'));
    pool.clear();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(pool.totalSize).toBe(0);
  });

  it('destroy prevents further use', () => {
    const pool = new ObjectPool((k) => ({ k }));
    pool.destroy();
    expect(pool.isDestroyed).toBe(true);
  });
});
