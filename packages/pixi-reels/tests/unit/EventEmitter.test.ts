import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/events/EventEmitter.js';

interface TestEvents extends Record<string, unknown[]> {
  'foo': [x: number, y: string];
  'bar': [];
  'baz': [data: { id: number }];
}

describe('EventEmitter', () => {
  it('emits events to listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.on('foo', fn);
    emitter.emit('foo', 42, 'hello');
    expect(fn).toHaveBeenCalledWith(42, 'hello');
  });

  it('supports multiple listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.on('foo', fn1);
    emitter.on('foo', fn2);
    emitter.emit('foo', 1, 'a');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('once listeners fire only once', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.once('bar', fn);
    emitter.emit('bar');
    emitter.emit('bar');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off removes a specific listener', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.on('bar', fn);
    emitter.off('bar', fn);
    emitter.emit('bar');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off without fn removes all listeners for event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.on('bar', fn1);
    emitter.on('bar', fn2);
    emitter.off('bar');
    emitter.emit('bar');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it('removeAllListeners clears everything', () => {
    const emitter = new EventEmitter<TestEvents>();
    emitter.on('foo', vi.fn());
    emitter.on('bar', vi.fn());
    emitter.removeAllListeners();
    expect(emitter.listenerCount('foo')).toBe(0);
    expect(emitter.listenerCount('bar')).toBe(0);
  });

  it('removeAllListeners with event clears only that event', () => {
    const emitter = new EventEmitter<TestEvents>();
    emitter.on('foo', vi.fn());
    emitter.on('bar', vi.fn());
    emitter.removeAllListeners('foo');
    expect(emitter.listenerCount('foo')).toBe(0);
    expect(emitter.listenerCount('bar')).toBe(1);
  });

  it('emit returns false when no listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    expect(emitter.emit('bar')).toBe(false);
  });

  it('emit returns true when listeners exist', () => {
    const emitter = new EventEmitter<TestEvents>();
    emitter.on('bar', vi.fn());
    expect(emitter.emit('bar')).toBe(true);
  });

  it('applies context to listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const context = { value: 42 };
    emitter.on('bar', function (this: any) {
      expect(this.value).toBe(42);
    }, context);
    emitter.emit('bar');
  });

  it('is safe to emit during listener removal', () => {
    const emitter = new EventEmitter<TestEvents>();
    const fn1 = vi.fn(() => emitter.off('bar', fn2));
    const fn2 = vi.fn();
    emitter.on('bar', fn1);
    emitter.on('bar', fn2);
    emitter.emit('bar');
    // fn2 should still fire because we snapshot the array
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('listenerCount returns correct count', () => {
    const emitter = new EventEmitter<TestEvents>();
    expect(emitter.listenerCount('foo')).toBe(0);
    emitter.on('foo', vi.fn());
    expect(emitter.listenerCount('foo')).toBe(1);
    emitter.on('foo', vi.fn());
    expect(emitter.listenerCount('foo')).toBe(2);
  });
});
