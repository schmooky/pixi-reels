type Listener = (...args: any[]) => void;

interface ListenerEntry {
  fn: Listener;
  context: unknown;
  once: boolean;
}

/**
 * Lightweight typed event emitter with zero dependencies.
 *
 * Usage:
 * ```ts
 * interface MyEvents {
 *   'foo': [x: number, y: string];
 *   'bar': [];
 * }
 * const emitter = new EventEmitter<MyEvents>();
 * emitter.on('foo', (x, y) => console.log(x, y));
 * emitter.emit('foo', 42, 'hello');
 * ```
 */
export class EventEmitter<TEvents extends Record<string, unknown[]>> {
  private _listeners = new Map<keyof TEvents, ListenerEntry[]>();

  on<K extends keyof TEvents>(
    event: K,
    fn: (...args: TEvents[K]) => void,
    context?: unknown,
  ): this {
    return this._add(event, fn as Listener, context, false);
  }

  once<K extends keyof TEvents>(
    event: K,
    fn: (...args: TEvents[K]) => void,
    context?: unknown,
  ): this {
    return this._add(event, fn as Listener, context, true);
  }

  off<K extends keyof TEvents>(
    event: K,
    fn?: (...args: TEvents[K]) => void,
    context?: unknown,
  ): this {
    const entries = this._listeners.get(event);
    if (!entries) return this;

    if (!fn) {
      this._listeners.delete(event);
      return this;
    }

    const filtered = entries.filter(
      (e) => e.fn !== fn || (context !== undefined && e.context !== context),
    );
    if (filtered.length === 0) {
      this._listeners.delete(event);
    } else {
      this._listeners.set(event, filtered);
    }
    return this;
  }

  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    const entries = this._listeners.get(event);
    if (!entries || entries.length === 0) return false;

    // Snapshot to allow mutations during iteration
    const snapshot = entries.slice();
    for (const entry of snapshot) {
      if (entry.once) {
        this.off(event, entry.fn as any, entry.context);
      }
      entry.fn.apply(entry.context, args);
    }
    return true;
  }

  removeAllListeners(event?: keyof TEvents): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  listenerCount(event: keyof TEvents): number {
    return this._listeners.get(event)?.length ?? 0;
  }

  private _add(
    event: keyof TEvents,
    fn: Listener,
    context: unknown,
    once: boolean,
  ): this {
    let entries = this._listeners.get(event);
    if (!entries) {
      entries = [];
      this._listeners.set(event, entries);
    }
    entries.push({ fn, context, once });
    return this;
  }
}
