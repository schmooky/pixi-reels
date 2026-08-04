import { AnimatedSprite, type Texture } from 'pixi.js';
import type { ReelCellInset, ReelCellQuad } from '../config/types.js';
import { ReelSymbol } from './ReelSymbol.js';
import { PerspectiveCell, textureCellInset } from './PerspectiveCell.js';

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
  private _perspective: PerspectiveCell;

  constructor(options: AnimatedSpriteSymbolOptions) {
    super();
    this._frames = options.frames;
    this._animationSpeed = options.animationSpeed ?? 1;
    const anchor = options.anchor ?? { x: 0, y: 0 };

    const firstFrames = Object.values(this._frames)[0] ?? [];
    this._animSprite = new AnimatedSprite(firstFrames.length > 0 ? firstFrames : []);
    this._animSprite.anchor.set(anchor.x, anchor.y);
    this._animSprite.animationSpeed = this._animationSpeed;
    this._animSprite.loop = false;
    this.view.addChild(this._animSprite);
    this._perspective = new PerspectiveCell(this.view, this._animSprite);
    // On a curved reel the mesh, not the sprite, is what draws. It has to be
    // handed each new frame or a playing win animation freezes on frame 0.
    this._animSprite.onFrameChange = () => {
      this._perspective.syncTexture(this._animSprite.texture);
    };
  }

  override get cellInset(): ReelCellInset | null {
    return textureCellInset(this._animSprite.texture);
  }

  override applyCellQuad(quad: ReelCellQuad | null): void {
    if (this._perspective.apply(quad, this._animSprite.texture)) {
      // The mesh's own corners carry the whole projection, so the view must
      // stay at identity. Anything else would apply the curve twice.
      this.view.scale.set(1, 1);
      this.view.pivot.set(0, 0);
      return;
    }
    // The mesh declined this texture (today: any atlas sub-frame). Take the
    // base class's uniform-scale fit so the cell is still on the drum.
    super.applyCellQuad(quad);
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
        // Return to frame 0 so the cell settles on its idle look instead
        // of holding the last frame of the win sequence (which for
        // generated pixel-art sequences often ends mid-action. muted,
        // shifted, or otherwise not the neutral base pose).
        this._animSprite.gotoAndStop(0);
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
    // Position the sprite to match its anchor so it fills the cell.
    // Without this, an anchor of (0.5, 0.5) would render the sprite with
    // its centre at the cell's top-left corner. only the bottom-right
    // quadrant visible inside the mask.
    this._animSprite.x = width * this._animSprite.anchor.x;
    this._animSprite.y = height * this._animSprite.anchor.y;
  }

  protected override onDestroy(): void {
    this._animSprite.onFrameChange = undefined;
    this._perspective.destroy();
  }
}
