import { AnimatedSprite, type Texture } from 'pixi.js';
import { ReelSymbol } from './ReelSymbol.js';

export interface AnimatedSpriteSymbolOptions {
  /** Map of symbolId → array of frame textures. */
  frames: Record<string, Texture[]>;
  /** Playback speed (frames per second multiplier). Default: 1. */
  animationSpeed?: number;
  /** Anchor point. Default: { x: 0.5, y: 0.5 }. */
  anchor?: { x: number; y: number };
}

/**
 * Symbol implementation using PixiJS AnimatedSprite.
 * Swaps frame arrays on activate. Win animation plays the full sequence.
 */
export class AnimatedSpriteSymbol extends ReelSymbol {
  private _animSprite: AnimatedSprite;
  private _frames: Record<string, Texture[]>;
  private _animationSpeed: number;
  private _winResolve: (() => void) | null = null;

  constructor(options: AnimatedSpriteSymbolOptions) {
    super();
    this._frames = options.frames;
    this._animationSpeed = options.animationSpeed ?? 1;
    const anchor = options.anchor ?? { x: 0, y: 0 };

    // Start with the first available frame set
    const firstFrames = Object.values(this._frames)[0] ?? [];
    this._animSprite = new AnimatedSprite(firstFrames.length > 0 ? firstFrames : []);
    this._animSprite.anchor.set(anchor.x, anchor.y);
    this._animSprite.animationSpeed = this._animationSpeed;
    this._animSprite.loop = false;
    this.view.addChild(this._animSprite);
  }

  protected onActivate(symbolId: string): void {
    const frames = this._frames[symbolId];
    if (frames && frames.length > 0) {
      this._animSprite.textures = frames;
      this._animSprite.gotoAndStop(0);
    }
  }

  protected onDeactivate(): void {
    this._animSprite.stop();
    this._winResolve = null;
  }

  async playWin(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._winResolve = resolve;
      this._animSprite.loop = false;
      this._animSprite.onComplete = () => {
        this._winResolve = null;
        this._animSprite.onComplete = undefined;
        resolve();
      };
      this._animSprite.gotoAndPlay(0);
    });
  }

  stopAnimation(): void {
    this._animSprite.stop();
    this._animSprite.gotoAndStop(0);
    if (this._winResolve) {
      this._winResolve();
      this._winResolve = null;
    }
  }

  resize(width: number, height: number): void {
    this._animSprite.width = width;
    this._animSprite.height = height;
  }
}
