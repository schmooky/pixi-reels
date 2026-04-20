/**
 * Contract for objects that allocate resources and need cleanup.
 * Every class that subscribes to tickers, creates display objects, or holds references
 * must implement this to prevent memory leaks.
 */
export interface Disposable {
  destroy(): void;
  readonly isDestroyed: boolean;
}
