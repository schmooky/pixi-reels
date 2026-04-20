import { ReelSymbol } from './ReelSymbol.js';

// Spine types imported dynamically — this is an optional peer dependency
let SpineClass: any = null;

async function loadSpine(): Promise<void> {
  try {
    const spineModule = await import('@esotericsoftware/spine-pixi-v8');
    SpineClass = spineModule.Spine;
  } catch {
    // Spine not available — SpineSymbol will throw on construction
  }
}

// Attempt to load Spine on module init
loadSpine();

export interface SpineSymbolOptions {
  /** Map of symbolId → SkeletonData. */
  skeletonDataMap: Record<string, any>;
  /** Default animation name to play in idle. Default: 'idle'. */
  idleAnimation?: string;
  /** Animation name to play on win. Default: 'win'. */
  winAnimation?: string;
  /** Default skin name. Default: 'default'. */
  defaultSkin?: string;
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
  private _winResolve: (() => void) | null = null;
  private _currentSkeletonKey: string = '';

  constructor(options: SpineSymbolOptions) {
    super();
    if (!SpineClass) {
      throw new Error(
        'SpineSymbol requires @esotericsoftware/spine-pixi-v8 to be installed. ' +
        'Install it with: npm install @esotericsoftware/spine-pixi-v8',
      );
    }
    this._skeletonDataMap = options.skeletonDataMap;
    this._idleAnimation = options.idleAnimation ?? 'idle';
    this._winAnimation = options.winAnimation ?? 'win';
    this._defaultSkin = options.defaultSkin ?? 'default';
  }

  protected onActivate(symbolId: string): void {
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

    // Set to idle
    if (this._spine.skeleton.data.findSkin(this._defaultSkin)) {
      this._spine.skeleton.setSkinByName(this._defaultSkin);
      this._spine.skeleton.setSlotsToSetupPose();
    }
    if (this._spine.skeleton.data.findAnimation(this._idleAnimation)) {
      this._spine.state.setAnimation(0, this._idleAnimation, true);
    }
  }

  protected onDeactivate(): void {
    if (this._spine) {
      this._spine.state.clearListeners();
      this._spine.state.clearTracks();
    }
    this._winResolve = null;
  }

  async playWin(): Promise<void> {
    if (!this._spine) return;
    if (!this._spine.skeleton.data.findAnimation(this._winAnimation)) return;

    return new Promise<void>((resolve) => {
      this._winResolve = resolve;
      const entry = this._spine.state.setAnimation(0, this._winAnimation, false);
      this._spine.state.addListener({
        complete: (trackEntry: any) => {
          if (trackEntry === entry) {
            this._spine.state.clearListeners();
            // Return to idle
            if (this._spine.skeleton.data.findAnimation(this._idleAnimation)) {
              this._spine.state.setAnimation(0, this._idleAnimation, true);
            }
            this._winResolve = null;
            resolve();
          }
        },
      });
    });
  }

  stopAnimation(): void {
    if (!this._spine) return;
    this._spine.state.clearListeners();
    if (this._spine.skeleton.data.findAnimation(this._idleAnimation)) {
      this._spine.state.setAnimation(0, this._idleAnimation, true);
    }
    if (this._winResolve) {
      this._winResolve();
      this._winResolve = null;
    }
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
    if (this._spine) {
      this._spine.state.clearListeners();
      this._spine.destroy();
      this._spine = null;
    }
  }
}
