import { FPS } from '../../symbols.config';
import {
  type AnimationIR,
  type BoneIR,
  type SlotIR,
  type CurveSpec,
  emptyBoneIR,
  emptySlotIR,
} from './types';

// ─────────────────────────────────────────────────────────────────
// Time helpers
// ─────────────────────────────────────────────────────────────────

/** Convert frames (at configured FPS) to seconds. */
export function frames(n: number): number {
  return n / FPS;
}

/** Pass through, for clarity in author code. */
export function seconds(n: number): number {
  return n;
}

// ─────────────────────────────────────────────────────────────────
// Bone builder
// ─────────────────────────────────────────────────────────────────

class BoneBuilder {
  private ir: BoneIR = emptyBoneIR();

  /** Per-property cursors. Each .xxxTo() advances its own property's cursor. */
  private cursors = {
    scale: 0,
    translate: 0,
    rotate: 0,
  };

  // ─────────────────────────────────────────────────────────────
  // Curve semantics: Spine treats `key.curve` as the curve OUT OF
  // that key into the next key. The DSL author writes
  //   .scaleTo(0.94, frames(5), 'easeOut')
  // meaning "ease into 0.94 over 5 frames" — i.e. the curve describes
  // the segment LEADING INTO the destination value. To honour author
  // intent while emitting Spine-correct JSON, every *To() method
  // attaches the requested curve to the PREVIOUS key (the segment
  // source) and places the new key with `linear` (which is the right
  // default for the segment AFTER it, until another *To() overrides).
  // Without this, the first segment of any animation is always linear
  // regardless of what the author wrote — producing a velocity
  // discontinuity at loop seams (the "snap back" symptom).
  // ─────────────────────────────────────────────────────────────

  /** Set frame-0 baseline scale. Idempotent if already keyed at 0. */
  scale(x: number, y: number = x): this {
    this.ir.scale.push({ time: 0, x, y, curve: 'linear' });
    this.cursors.scale = 0;
    return this;
  }

  /** Advance scale cursor by `duration` seconds and key (x, y) there. */
  scaleTo(x: number, duration: number, curve: CurveSpec = 'linear', y: number = x): this {
    const prev = this.ir.scale[this.ir.scale.length - 1];
    if (prev) prev.curve = curve;
    this.cursors.scale += duration;
    this.ir.scale.push({ time: this.cursors.scale, x, y, curve: 'linear' });
    return this;
  }

  /** Advance scale cursor without keying. Useful for spacing phases. */
  scaleHold(duration: number): this {
    this.cursors.scale += duration;
    return this;
  }

  translate(x: number, y: number): this {
    this.ir.translate.push({ time: 0, x, y, curve: 'linear' });
    this.cursors.translate = 0;
    return this;
  }

  translateTo(x: number, y: number, duration: number, curve: CurveSpec = 'linear'): this {
    const prev = this.ir.translate[this.ir.translate.length - 1];
    if (prev) prev.curve = curve;
    this.cursors.translate += duration;
    this.ir.translate.push({ time: this.cursors.translate, x, y, curve: 'linear' });
    return this;
  }

  translateHold(duration: number): this {
    this.cursors.translate += duration;
    return this;
  }

  rotate(angle: number): this {
    this.ir.rotate.push({ time: 0, angle, curve: 'linear' });
    this.cursors.rotate = 0;
    return this;
  }

  rotateTo(angle: number, duration: number, curve: CurveSpec = 'linear'): this {
    const prev = this.ir.rotate[this.ir.rotate.length - 1];
    if (prev) prev.curve = curve;
    this.cursors.rotate += duration;
    this.ir.rotate.push({ time: this.cursors.rotate, angle, curve: 'linear' });
    return this;
  }

  rotateHold(duration: number): this {
    this.cursors.rotate += duration;
    return this;
  }

  build(): BoneIR {
    return this.ir;
  }
}

// ─────────────────────────────────────────────────────────────────
// Slot builder
// ─────────────────────────────────────────────────────────────────

class SlotBuilder {
  private ir: SlotIR = emptySlotIR();

  private cursors = {
    rgba: 0,
    attachment: 0,
  };

  /** 8-char hex including alpha, e.g. 'ffffffff' or 'ff8800cc'. */
  rgba(color: string): this {
    this.ir.rgba.push({ time: 0, color, curve: 'linear' });
    this.cursors.rgba = 0;
    return this;
  }

  rgbaTo(color: string, duration: number, curve: CurveSpec = 'linear'): this {
    // See bone builder header — curves attach to the segment SOURCE.
    const prev = this.ir.rgba[this.ir.rgba.length - 1];
    if (prev) prev.curve = curve;
    this.cursors.rgba += duration;
    this.ir.rgba.push({ time: this.cursors.rgba, color, curve: 'linear' });
    return this;
  }

  rgbaHold(duration: number): this {
    this.cursors.rgba += duration;
    return this;
  }

  /** Swap or clear the slot's attachment. Pass null to hide. */
  attachment(name: string | null): this {
    this.ir.attachment.push({ time: 0, name });
    this.cursors.attachment = 0;
    return this;
  }

  attachmentAt(name: string | null, duration: number): this {
    this.cursors.attachment += duration;
    this.ir.attachment.push({ time: this.cursors.attachment, name });
    return this;
  }

  build(): SlotIR {
    return this.ir;
  }
}

// ─────────────────────────────────────────────────────────────────
// Animation builder
// ─────────────────────────────────────────────────────────────────

export type AnimOpts = {
  loop?: boolean;
};

class AnimationBuilder {
  private bones = new Map<string, BoneIR>();
  private slots = new Map<string, SlotIR>();

  constructor(private name: string, private opts: AnimOpts = {}) {}

  bone(name: string, fn: (b: BoneBuilder) => BoneBuilder | void): this {
    const builder = new BoneBuilder();
    fn(builder);
    this.bones.set(name, builder.build());
    return this;
  }

  slot(name: string, fn: (s: SlotBuilder) => SlotBuilder | void): this {
    const builder = new SlotBuilder();
    fn(builder);
    this.slots.set(name, builder.build());
    return this;
  }

  build(): AnimationIR {
    return {
      name: this.name,
      loop: this.opts.loop ?? false,
      bones: this.bones,
      slots: this.slots,
    };
  }
}

/** Entry point: `anim('idle', { loop: true }).bone(...).slot(...)` */
export function anim(name: string, opts: AnimOpts = {}): AnimationBuilder {
  return new AnimationBuilder(name, opts);
}
