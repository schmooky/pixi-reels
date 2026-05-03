/**
 * Intermediate representation. The builder produces this, the compiler
 * consumes it. The IR is decoupled from Spine's wire format so we can
 * validate, transform, or retarget without touching authoring code.
 */

export type CurveSpec =
  | 'linear'
  | 'stepped'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | [number, number, number, number]; // raw cubic bezier control points

export type ScaleKey = { time: number; x: number; y: number; curve: CurveSpec };
export type TranslateKey = { time: number; x: number; y: number; curve: CurveSpec };
export type RotateKey = { time: number; angle: number; curve: CurveSpec };
export type RGBAKey = { time: number; color: string; curve: CurveSpec };
export type AttachmentKey = { time: number; name: string | null };

export type BoneIR = {
  scale: ScaleKey[];
  translate: TranslateKey[];
  rotate: RotateKey[];
};

export type SlotIR = {
  rgba: RGBAKey[];
  attachment: AttachmentKey[];
};

export type AnimationIR = {
  name: string;
  loop: boolean;
  bones: Map<string, BoneIR>;
  slots: Map<string, SlotIR>;
};

export function emptyBoneIR(): BoneIR {
  return { scale: [], translate: [], rotate: [] };
}

export function emptySlotIR(): SlotIR {
  return { rgba: [], attachment: [] };
}
