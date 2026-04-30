import { gsap } from 'gsap';
import { roundBus } from './roundBus.js';

export interface WinBoxOptions {
  /** Currency prefix shown before the number. Default: empty. */
  prefix?: string;
  /** Tickup duration in seconds (linear count-up). Default: 1.4. */
  tickupSeconds?: number;
  /** Where to anchor the box. Default: top-center. */
  anchor?: 'top' | 'bottom';
  /**
   * Element to attach the box to. Default: `document.body`.
   *
   * Pass a positioned (`relative`/`absolute`/`fixed`) host element to scope
   * the box inside it — useful when the demo runs embedded on a website
   * page and a viewport-fixed element would float over unrelated content.
   */
  mountTo?: HTMLElement;
}

/**
 * DOM-based win counter with a GSAP tickup. Subscribes to the demo
 * `roundBus`; the demo never touches the DOM directly. Mirrors how a real
 * slot client splits "engine fires events" from "UI reacts".
 *
 * The tickup tweens an internal counter from current -> target, formatting
 * to whole numbers on every onUpdate. `round:reset` snaps to 0 and hides
 * the box; the next `win:set` / `win:add` shows it again.
 */
export class WinBox {
  private _el: HTMLDivElement;
  private _amountEl: HTMLSpanElement;
  private _prefix: string;
  private _tickupSeconds: number;
  private _current = 0;
  private _tween: gsap.core.Tween | null = null;
  private _disposers: Array<() => void> = [];

  constructor(opts: WinBoxOptions = {}) {
    this._prefix = opts.prefix ?? '';
    this._tickupSeconds = opts.tickupSeconds ?? 1.4;

    const mountTo = opts.mountTo ?? document.body;
    const scoped = mountTo !== document.body;
    const positionStyle = scoped
      ? `position:absolute;${opts.anchor === 'bottom' ? 'bottom:16px' : 'top:16px'};`
      : `position:fixed;${opts.anchor === 'bottom' ? 'bottom:90px' : 'top:24px'};`;

    const box = document.createElement('div');
    box.style.cssText =
      `${positionStyle}left:50%;transform:translateX(-50%);` +
      'padding:12px 28px;font-family:"Roboto Condensed","Arial Narrow",system-ui,sans-serif;' +
      'font-size:32px;font-weight:700;color:#ffd700;' +
      'background:rgba(0,0,0,0.55);border:2px solid rgba(255,215,0,0.55);' +
      'border-radius:10px;letter-spacing:0.04em;' +
      'box-shadow:0 6px 18px rgba(0,0,0,0.4);' +
      'opacity:0;pointer-events:none;z-index:1100;' +
      'transition:opacity 180ms ease-out;';

    const label = document.createElement('span');
    label.textContent = 'WIN ';
    label.style.cssText = 'opacity:0.7;font-size:18px;letter-spacing:0.12em;';
    const amount = document.createElement('span');
    amount.textContent = `${this._prefix}0`;

    box.appendChild(label);
    box.appendChild(amount);
    mountTo.appendChild(box);

    this._el = box;
    this._amountEl = amount;

    const onReset = () => this._reset();
    const onSet = (target: number) => this._tickTo(target);
    const onAdd = (delta: number) => this._tickTo(this._current + delta);
    roundBus.on('round:reset', onReset);
    roundBus.on('win:set', onSet);
    roundBus.on('win:add', onAdd);
    this._disposers.push(() => {
      roundBus.off('round:reset', onReset);
      roundBus.off('win:set', onSet);
      roundBus.off('win:add', onAdd);
    });
  }

  /** Dispose listeners and remove the DOM element. Call from boot cleanup. */
  destroy(): void {
    for (const d of this._disposers) d();
    this._disposers = [];
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
    this._el.remove();
  }

  private _reset(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
    this._current = 0;
    this._amountEl.textContent = `${this._prefix}0`;
    this._el.style.opacity = '0';
  }

  private _tickTo(target: number): void {
    if (this._tween) this._tween.kill();
    if (target <= 0) {
      this._reset();
      return;
    }

    this._el.style.opacity = '1';

    const proxy = { v: this._current };
    const next = target;
    this._tween = gsap.to(proxy, {
      v: next,
      duration: this._tickupSeconds,
      ease: 'power1.out',
      onUpdate: () => {
        this._current = proxy.v;
        this._amountEl.textContent = `${this._prefix}${Math.round(proxy.v)}`;
      },
      onComplete: () => {
        this._current = next;
        this._amountEl.textContent = `${this._prefix}${Math.round(next)}`;
        this._tween = null;
        gsap.fromTo(
          this._el,
          { scale: 1.0 },
          { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' },
        );
      },
    });
  }
}
