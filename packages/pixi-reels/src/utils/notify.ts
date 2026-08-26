/**
 * The library's one console channel.
 *
 * Every warning and error pixi-reels emits goes through here, so they all look
 * the same, all carry a stable CODE you can grep for or look up, and all obey
 * one volume knob. Before this, ten call sites hand-rolled their own
 * `[pixi-reels] ...` string (one forgot the prefix entirely) and there was no
 * way to quieten them in production.
 *
 * A notice is for something a DEVELOPER should act on: a call that will not do
 * what they meant, a hook of theirs that threw, a value that had to be
 * clamped. It is never for per-frame state. Nothing here runs in the hot path.
 *
 * ```ts
 * import { setLogLevel } from 'pixi-reels';
 * setLogLevel('warn');   // keep problems, drop the advice
 * setLogLevel('silent'); // production
 * ```
 */

/** How much the library is allowed to say. Each level includes the ones before it. */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info';

const RANK: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3 };

// `'info'` by default because the notices this replaced were unconditional;
// anything lower would have silently deleted advice the engine used to give.
let currentLevel: LogLevel = 'info';

/**
 * Set how much the library prints. Default `'info'`, which is everything.
 * `'warn'` drops the advisory notices (mask auto-picks and the like) and keeps
 * problems; `'silent'` turns the channel off entirely - reasonable for a
 * production build, as long as you have read the warnings once.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** The active {@link LogLevel}. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Codes already emitted, for the `once` option. */
const seen = new Set<string>();

/** Test seam: forget which `once` notices have fired. */
export function resetNoticesForTest(): void {
  seen.clear();
}

interface NoticeOptions {
  /** Emit only the first time this code comes up. For advice that would otherwise repeat per reel, per frame or per builder. */
  once?: boolean;
}

/**
 * `%c` styling is a browser console feature. Node prints the directives
 * literally and turns a tidy badge into noise, so the two get different
 * shapes of the same message.
 */
const isBrowserConsole = typeof document !== 'undefined';

const BADGE = 'background:#1f1d1b;color:#fef08a;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700';
const CODE_STYLE: Record<'error' | 'warn' | 'info', string> = {
  error: 'background:#7f1d1d;color:#fee2e2;padding:2px 6px;border-radius:0 3px 3px 0',
  warn: 'background:#78350f;color:#fef3c7;padding:2px 6px;border-radius:0 3px 3px 0',
  info: 'background:#334155;color:#e2e8f0;padding:2px 6px;border-radius:0 3px 3px 0',
};
const RESET = 'background:transparent;color:inherit;font-weight:400';

function emit(
  kind: 'error' | 'warn' | 'info',
  code: string,
  message: string,
  detail: unknown[],
  options?: NoticeOptions,
): void {
  if (RANK[currentLevel] < RANK[kind]) return;
  if (options?.once) {
    if (seen.has(code)) return;
    seen.add(code);
  }

  // `console[kind]` keeps devtools filtering, stack capture and the browser's
  // own warn/error styling working. a single `console.log` would lose all three.
  const sink = console[kind] as (...args: unknown[]) => void;
  if (isBrowserConsole) {
    sink(
      `%cpixi-reels%c${code}%c ${message}`,
      BADGE,
      CODE_STYLE[kind],
      RESET,
      ...detail,
    );
  } else {
    sink(`[pixi-reels] ${kind}(${code}) ${message}`, ...detail);
  }
}

/**
 * Something is wrong and the library could not do what was asked, but the app
 * is still standing (usually because we recovered).
 */
export function noticeError(code: string, message: string, ...detail: unknown[]): void {
  emit('error', code, message, detail);
}

/** A call will not do what the caller probably meant, or a value had to be clamped. */
export function noticeWarn(code: string, message: string, ...detail: unknown[]): void {
  emit('warn', code, message, detail);
}

/** As {@link noticeWarn}, but only the first time this code comes up. */
export function noticeWarnOnce(code: string, message: string, ...detail: unknown[]): void {
  emit('warn', code, message, detail, { once: true });
}

/** Worth knowing, not worth acting on. Dropped at `'warn'` and below. */
export function noticeInfo(code: string, message: string, ...detail: unknown[]): void {
  emit('info', code, message, detail);
}
