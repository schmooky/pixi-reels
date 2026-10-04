import { ReelSymbol } from './ReelSymbol.js';

// Spine types imported dynamically. this is an optional peer dependency
let SpineClass: any = null;

// Kick off the optional import at module init and keep the promise so callers
// can wait for it. Without this, constructing a SpineSymbol on a cold start
// (before the dynamic import resolves) throws the "not installed" error even
// when Spine IS installed - it just hadn't finished loading yet.
const spineReady: Promise<void> = (async () => {
  try {
    const spineModule = await import('@esotericsoftware/spine-pixi-v8');
    SpineClass = spineModule.Spine;
  } catch {
    // Spine not available. SpineSymbol will throw on construction.
  }
})();

/**
 * Resolves once the optional `@esotericsoftware/spine-pixi-v8` import has
 * settled (whether or not it was installed). Await this before constructing
 * `SpineSymbol`s if you build the reel set immediately on app start, so a cold
 * load can't throw the misleading "not installed" error.
 */
export function whenSpineReady(): Promise<void> {
  return spineReady;
}

export interface SpineSymbolOptions {
  /** Map of symbolId → SkeletonData. */
  skeletonDataMap: Record<string, any>;
  /** Default animation name to play in idle. Default: 'idle'. */
  idleAnimation?: string;
  /** Animation name to play on win. Default: 'win'. */
  winAnimation?: string;
  /** Default skin name. Default: 'default'. */
  defaultSkin?: string;
  /**
   * Fail loud on unmapped animations. When `true`, activating or winning with
   * a configured animation name that the skeleton doesn't define throws instead
   * of silently showing nothing (catches typos like `ide` vs `idle`). Default
   * `false` to preserve the lenient behavior. See ADR 011.
   */
  strict?: boolean;
}

/**
 * Symbol implementation using Spine 2D skeletal animation.
 *
 * Requires `@esotericsoftware/spine-pixi-v8` as an optional peer dependency.
 * If Spine is not installed, constructing a SpineSymbol will throw.
 */
export class SpineSymbol extends ReelSymbol {
  private _spine: any = null;
  private _skeletonDataMap: Record<string, any>;
  private _idleAnimation: string;
  private _winAnimation: string;
  private _defaultSkin: string;
  /** The win in flight: its track entry and the resolve of its `playWin()`. */
  private _win: { entry: any; resolve: () => void } | null = null;
  private _currentSkeletonKey: string = '';
  private _strict: boolean;

  constructor(options: SpineSymbolOptions) {
    super();
    if (!SpineClass) {
      throw new Error(
        'SpineSymbol could not use @esotericsoftware/spine-pixi-v8. Either it is ' +
        'not installed (npm install @esotericsoftware/spine-pixi-v8), or its ' +
        'dynamic import has not resolved yet on a cold start — await ' +
        'whenSpineReady() before constructing SpineSymbols.',
      );
    }
    this._skeletonDataMap = options.skeletonDataMap;
    this._idleAnimation = options.idleAnimation ?? 'idle';
    this._winAnimation = options.winAnimation ?? 'win';
    this._defaultSkin = options.defaultSkin ?? 'default';
    this._strict = options.strict ?? false;
  }

  protected onActivate(symbolId: string): void {
    // A win left playing on the instance about to be reused, or destroyed
    // below, would never complete: settle its `await` now.
    this._settleWin();
    const skeletonData = this._skeletonDataMap[symbolId];
    if (!skeletonData) return;

    // Reuse existing spine if same skeleton data
    if (this._currentSkeletonKey !== symbolId) {
      if (this._spine) {
        this.view.removeChild(this._spine);
        this._spine.destroy();
      }
      this._spine = new SpineClass({ skeletonData });
      this.view.addChild(this._spine);
      this._currentSkeletonKey = symbolId;
    }

    if (this._spine.skeleton.data.findSkin(this._defaultSkin)) {
      this._spine.skeleton.setSkinByName(this._defaultSkin);
      this._spine.skeleton.setSlotsToSetupPose();
    }
    if (this._spine.skeleton.data.findAnimation(this._idleAnimation)) {
      this._spine.state.setAnimation(0, this._idleAnimation, true);
    } else if (this._strict) {
      throw new Error(
        `SpineSymbol(strict): idle animation '${this._idleAnimation}' not found ` +
        `on skeleton '${symbolId}'.`,
      );
    }
  }

  protected onDeactivate(): void {
    // Settle any pending playWin so awaiters don't hang when the symbol is
    // recycled mid-animation. Mirrors the same fix in SpineReelSymbol.
    this._settleWin();
    // The tracks only: a listener on the state is not the symbol's to drop.
    if (this._spine) this._spine.state.clearTracks();
  }

  async playWin(): Promise<void> {
    if (!this._spine) return;
    if (!this._spine.skeleton.data.findAnimation(this._winAnimation)) {
      if (this._strict) {
        throw new Error(
          `SpineSymbol(strict): win animation '${this._winAnimation}' not found ` +
          `on skeleton '${this._currentSkeletonKey}'.`,
        );
      }
      return;
    }

    // A win still playing settles before this one takes its track, or its
    // `await` would wait on an animation that never completes.
    this._settleWin();
    const spine = this._spine;
    return new Promise<void>((resolve) => {
      const entry = spine.state.setAnimation(0, this._winAnimation, false);
      // The entry's own listener, not one on the state: spine calls it for
      // this entry alone, and nothing here ever edits the state's listener
      // list. Clearing that list dropped every listener the game had added,
      // and doing it inside spine's dispatch, which walks the list live, made
      // the listeners after this one miss the event.
      entry.listener = {
        complete: () => {
          if (!this._settleWin(entry)) return;
          if (spine.skeleton.data.findAnimation(this._idleAnimation)) {
            spine.state.setAnimation(0, this._idleAnimation, true);
          }
        },
        // Something else took track 0 before the win completed: a subclass
        // swapping the animation, `stopAnimation()`, the tracks cleared.
        interrupt: () => this._settleWin(entry),
        end: () => this._settleWin(entry),
      };
      this._win = { entry, resolve };
    });
  }

  stopAnimation(): void {
    if (!this._spine) return;
    this._settleWin();
    if (this._spine.skeleton.data.findAnimation(this._idleAnimation)) {
      this._spine.state.setAnimation(0, this._idleAnimation, true);
    }
  }

  /**
   * Settle the win in flight, if any: drop its track entry's listener and
   * resolve its `playWin()`. A listener passes its own `entry`, so a late
   * event from an earlier win cannot settle a newer one. `true` when it
   * settled one.
   */
  private _settleWin(entry?: unknown): boolean {
    const win = this._win;
    if (!win || (entry !== undefined && win.entry !== entry)) return false;
    this._win = null;
    // Spine pools its track entries: a listener left on this one would fire
    // for whatever animation reuses it.
    win.entry.listener = null;
    win.resolve();
    return true;
  }

  resize(width: number, height: number): void {
    if (!this._spine) return;
    const bounds = this._spine.getBounds();
    if (bounds.width > 0 && bounds.height > 0) {
      this._spine.scale.set(
        width / bounds.width,
        height / bounds.height,
      );
    }
  }

  protected override onDestroy(): void {
    this._settleWin();
    if (this._spine) {
      // The spine goes, and everything listening to it with it.
      this._spine.state.clearListeners();
      this._spine.destroy();
      this._spine = null;
    }
  }
}
