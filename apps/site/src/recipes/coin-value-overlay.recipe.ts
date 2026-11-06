import * as PIXI from 'pixi.js';
import { ReelSetBuilder, ReelSymbol, SpeedPresets } from 'pixi-reels';
import { createAssets, tapToSpin } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Beginner: number on a ready-made coin',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 260,
  needs: ['hw-sprites'],
} as const satisfies RecipeMeta;

// BEGINNER LESSON - put a number on a ready-made coin without drawing the
// coin yourself.
//
// Lesson 1 drew the whole coin with PIXI.Graphics. In a real game the coin
// art already exists (a sprite or a Spine skeleton), and all you add is the
// number ON TOP. That's "composition": your symbol's `view` holds two
// children - the artwork and a text label.
//
// `this.view` is a container, so you `addChild` both and position them
// in resize().
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const assets = createAssets();
  const { coin } = await assets.holdAndWinSprites(); // the diamond-coin sprite frames
  const COIN_TEX = coin[0];                        // use one frame as the still coin

  class LabeledCoin extends ReelSymbol {
    value: number;
    sprite: PIXI.Sprite;
    label: PIXI.BitmapText;
    constructor(options: { value: number }) {
      super();
      this.value = options.value;
      this.sprite = new PIXI.Sprite(COIN_TEX); // the ready-made coin art
      this.sprite.anchor.set(0.5);
      this.label = new PIXI.BitmapText({ text: '', style: { fontFamily: 'DiamondDigits', fontSize: 36 } });
      this.label.anchor.set(0.5);
      this.view.addChild(this.sprite); // artwork first (behind)
      this.view.addChild(this.label);  // number on top
    }

    onActivate() { this.label.text = String(this.value); }
    onDeactivate() {}
    async playWin() {}
    stopAnimation() {}

    resize(width: number, height: number) {
      // center the coin art and scale it to fit the cell
      this.sprite.position.set(width / 2, height / 2);
      this.sprite.scale.set(Math.min(width / this.sprite.texture.width, height / this.sprite.texture.height));
      // center the number on the coin face
      this.label.style.fontSize = Math.floor(height * 0.34);
      this.label.position.set(width / 2, height / 2);
    }
  }

  const VALUES = [2, 5, 10, 25, 50];
  const idFor = (v: number) => `coin${v}`;
  const REELS = 3, CELL = 100, GAP = 8;

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(1)
    .symbolSize(CELL, CELL).symbolGap(GAP, GAP)
    .symbols((r) => { for (const v of VALUES) r.register(idFor(v), LabeledCoin, { value: v }); })
    .weights(Object.fromEntries(VALUES.map((v) => [idFor(v), 1])))
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker)
    .build();
  app.stage.addChild(reelSet);
  reelSet.x = (app.screen.width - (REELS * CELL + (REELS - 1) * GAP)) / 2;
  reelSet.y = (app.screen.height - CELL) / 2 - 6;

  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => Array.from({ length: REELS }, () => [idFor(VALUES[Math.floor(Math.random() * VALUES.length)])]),
  });
  return { reelSet };
}
