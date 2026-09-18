type Listener = (...args: any[]) => void;

interface ListenerEntry {
  fn: Listener;
  context: unknown;
  once: boolean;
}

/**
 * Typed event emitter with zero dependencies.
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
  private _any: Array<(event: Extract<keyof TEvents, string>, ...args: unknown[]) => void> = [];

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

  /**
   * Hear every event this emitter raises, name first: for a trace, an events
   * panel, a recorder. Not for game logic, which names the events it wants.
   * Runs after the event's own listeners.
   */
  onAny(fn: (event: Extract<keyof TEvents, string>, ...args: unknown[]) => void): this {
    this._any.push(fn);
    return this;
  }

  offAny(fn: (event: Extract<keyof TEvents, string>, ...args: unknown[]) => void): this {
    this._any = this._any.filter((f) => f !== fn);
    return this;
  }

  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    const entries = this._listeners.get(event);
    const any = this._any.length > 0 ? this._any.slice() : null;
    if ((!entries || entries.length === 0) && !any) return false;

    if (entries && entries.length > 0) {
      // Snapshot to allow mutations during iteration
      const snapshot = entries.slice();
      for (const entry of snapshot) {
        if (entry.once) {
          // Remove this specific entry by identity. Calling off(fn, context)
          // would drop *every* listener with the same fn reference — including a
          // separate persistent on() registration of the same handler.
          this._removeEntry(event, entry);
        }
        entry.fn.apply(entry.context, args);
      }
    }
    if (any) {
      // A `Record<string, ...>` key is a string at run time; the `number` half
      // of `keyof` is the index signature's artefact, hence the two-step cast.
      for (const fn of any) fn(event as unknown as Extract<keyof TEvents, string>, ...args);
    }
    return true;
  }

  private _removeEntry(event: keyof TEvents, entry: ListenerEntry): void {
    const entries = this._listeners.get(event);
    if (!entries) return;
    const idx = entries.indexOf(entry);
    if (idx === -1) return;
    entries.splice(idx, 1);
    if (entries.length === 0) this._listeners.delete(event);
  }

  removeAllListeners(event?: keyof TEvents): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
      this._any = [];
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
