import { PerspectiveMesh, type Container, type Texture } from 'pixi.js';
import type { ReelCellInset, ReelCellQuad } from '../config/types.js';

/**
 * The slice of its cell a texture's opaque art really occupies.
 *
 * TexturePacker trims the transparent margin off each frame, so a 300x300
 * symbol whose art is a 152x152 blob at (74, 74) ships as a 152x152 frame. A
 * `Sprite` puts that back; a mesh does not, so the reel has to be told or it
 * projects - and inflates - the whole cell.
 *
 * `null` for an untrimmed texture, which needs no correction.
 */
export function textureCellInset(texture: Texture): ReelCellInset | null {
  const trim = texture.trim;
  const orig = texture.orig;
  if (!trim || orig.width <= 0 || orig.height <= 0) return null;
  if (trim.width === orig.width && trim.height === orig.height) return null;
  return {
    left: trim.x / orig.width,
    top: trim.y / orig.height,
    right: (trim.x + trim.width) / orig.width,
    bottom: (trim.y + trim.height) / orig.height,
  };
}

/**
 * Whether a texture can go through the perspective mesh.
 *
 * Only textures owning their whole source qualify. An atlas SUB-frame does
 * not: the mesh addresses its source with plain 0..1 UVs, and remapping them
 * onto the frame - via `texture.uvs`, via `textureMatrix`, or leaving it to
 * PixiJS - has not produced a correct draw here. Unmapped, the cell shows the
 * whole sheet; mapped by hand, a magnified crop of the right frame, which says
 * the mapping is applied somewhere else too. Rather than ship either, a
 * sub-frame falls back to the affine fit in `ReelSymbol.applyCellQuad()` -
 * correct, just not keystoned.
 *
 * Generated textures, single loaded images and render textures pass. Atlas
 * frames - the common production case - do not, yet.
 */
export function canProjectTexture(texture: Texture): boolean {
  const source = texture.source;
  if (!source) return false;
  if (texture.rotate !== 0) return false;
  const { frame, orig } = texture;
  if (frame.x !== 0 || frame.y !== 0) return false;
  if (frame.width !== source.width || frame.height !== source.height) return false;
  return orig.width === frame.width && orig.height === frame.height;
}

/**
 * Tessellation of the projected quad. PixiJS builds the perspective by
 * interpolating UVs across a grid, so this is the quality knob: too few and a
 * keystoned cell reads as a plain stretch, too many and every symbol on the
 * board costs a pile of vertices. Slot cells are small and their trapezoids are
 * mild, so the PixiJS default of 10 is more than enough.
 */
const VERTICES = 10;

/**
 * Draws a texture through a real perspective quad.
 *
 * What makes a curved reel a projection rather than a squash. A `Container`
 * transform is affine - it can scale a cell, never turn it into a trapezoid -
 * so a cell rotated away comes out a smaller rectangle instead of one with a
 * narrower far edge. `PerspectiveMesh` maps the texture onto four arbitrary
 * corners with perspective-correct interpolation, and costs no render pass
 * because the symbol already owns a texture.
 *
 * Lazy: a game that never calls `curve()` allocates no mesh and keeps
 * rendering through its plain sprite.
 *
 * @internal Shared by `SpriteSymbol` and `AnimatedSpriteSymbol`. Use it the
 * same way from a custom symbol whose content is a single texture.
 */
export class PerspectiveCell {
  private _mesh: PerspectiveMesh | null = null;
  private _active = false;
  private _uvScratch: Float32Array | null = null;
  private _uvSource: Texture | null = null;

  /**
   * @param _view the symbol's own view, which the mesh is parented to
   * @param _flat the display object used when the reel is flat. hidden while
   *   the mesh is driving, so the two never draw on top of each other
   */
  constructor(
    private readonly _view: Container,
    private readonly _flat: Container,
  ) {}

  /** True while the perspective mesh is the thing being drawn. */
  get isActive(): boolean {
    return this._active;
  }

  /**
   * The mesh, once one exists. Animate THIS, not the symbol's view, for a win
   * pulse on a curved reel - it is pivoted on the quad's centre, so a scale
   * tween pulses in place instead of swinging out from the cell corner.
   */
  get mesh(): PerspectiveMesh | null {
    return this._mesh;
  }

  /**
   * Project the cell, or hand rendering back to the flat display object when
   * `quad` is `null`.
   *
   * @param quad the projected footprint, view-local
   * @param texture what to draw. re-read on every call so an animated symbol
   *   can swap frames without telling us
   */
  apply(quad: ReelCellQuad | null, texture: Texture): boolean {
    if (quad === null || !canProjectTexture(texture)) {
      if (!this._active) return false;
      this._active = false;
      this._flat.visible = true;
      if (this._mesh) this._mesh.visible = false;
      return false;
    }

    const mesh = this._ensureMesh(texture);
    if (mesh.texture !== texture) mesh.texture = texture;
    this._syncUvs(mesh, texture);
    mesh.setCorners(quad.x0, quad.y0, quad.x1, quad.y1, quad.x2, quad.y2, quad.x3, quad.y3);
    // Pivot and position on the quad's centre: renders unchanged at scale 1,
    // but a scale tween pulses about the middle of the cell.
    const cx = (quad.x0 + quad.x1 + quad.x2 + quad.x3) / 4;
    const cy = (quad.y0 + quad.y1 + quad.y2 + quad.y3) / 4;
    mesh.pivot.set(cx, cy);
    mesh.position.set(cx, cy);

    if (!this._active) {
      this._active = true;
      this._flat.visible = false;
      mesh.visible = true;
    }
    return true;
  }

  /** Reset the mesh's own transform. Call from `stopAnimation` / `onDeactivate`. */
  resetTransform(): void {
    if (this._mesh) this._mesh.scale.set(1, 1);
  }

  /**
   * Push a new texture through without re-projecting. For the pooled swap in
   * `onActivate`, where the identity changes but the quad has not.
   */
  syncTexture(texture: Texture): void {
    if (this._active && this._mesh && this._mesh.texture !== texture) {
      this._mesh.texture = texture;
      this._syncUvs(this._mesh, texture);
    }
  }

  destroy(): void {
    if (!this._mesh) return;
    this._mesh.destroy();
    this._mesh = null;
    this._active = false;

    this._uvScratch = null;
    this._uvSource = null;
  }

  private _ensureMesh(texture: Texture): PerspectiveMesh {
    if (this._mesh) return this._mesh;
    this._mesh = new PerspectiveMesh({
      texture,
      verticesX: VERTICES,
      verticesY: VERTICES,
    });
    // `PerspectivePlaneGeometry` warps VERTEX POSITIONS and leaves the UVs
    // alone, so the atlas mapping is ours to own. One scratch buffer, rewritten
    // from the grid on every texture swap rather than remapped in place, which
    // would compound.
    this._uvScratch = new Float32Array(VERTICES * VERTICES * 2);
    this._view.addChild(this._mesh);
    return this._mesh;
  }

  /**
   * Fold the texture's atlas frame into the mesh's UVs.
   *
   * A `Sprite` gets this free; a `Mesh` does not. Its 0..1 UVs address the
   * whole SHEET, so an unmapped mesh draws the entire atlas squeezed into one
   * cell.
   *
   * `texture.uvs` carries the frame's corners in source space and PixiJS keeps
   * it current, so interpolating between them is exact. `textureMatrix` is not
   * necessarily updated for this texture yet, and yields out-of-range UVs that
   * sample whatever is next door on the sheet.
   */
  private _syncUvs(mesh: PerspectiveMesh, texture: Texture): void {
    if (this._uvSource === texture) return;
    const out = this._uvScratch;
    if (!out) return;
    this._uvSource = texture;

    // Grid coordinates from the vertex index, not read back off the geometry:
    // the UV buffer is not necessarily populated at construction, and a
    // snapshot of zeros points every vertex at the frame's first texel - a
    // cell of flat colour. Row-major, matching PixiJS's own plane transform.
    const { x0, y0, x1, y1, x2, y2, x3, y3 } = texture.uvs;
    const span = VERTICES - 1;
    for (let k = 0; k < out.length / 2; k++) {
      const u = (k % VERTICES) / span;
      const v = Math.floor(k / VERTICES) / span;
      const tl = (1 - u) * (1 - v);
      const tr = u * (1 - v);
      const br = u * v;
      const bl = (1 - u) * v;
      out[k * 2] = tl * x0 + tr * x1 + br * x2 + bl * x3;
      out[k * 2 + 1] = tl * y0 + tr * y1 + br * y2 + bl * y3;
    }
    mesh.geometry.uvs = out;
  }
}
