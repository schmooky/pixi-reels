import { Container, MeshPlane, RenderTexture, type Renderer, type Ticker } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';
import type { ReelAxis } from './ReelAxis.js';
import type { ReelCurve } from './ReelCurve.js';

/**
 * Vertices per axis in the warp grid. The bend is applied at the VERTEX level,
 * so this is the quality knob: too few and the drum reads as a few flat facets,
 * too many and every reel costs a pile of geometry for a curve that is smooth
 * to begin with. 16 is well past the point where the facets stop being visible
 * at slot-cell sizes.
 */
const GRID = 16;

/**
 * Bend a whole reel, whatever is inside it.
 *
 * The per-symbol projection in {@link ReelCurve} can only bend content that IS
 * a texture, because a `Container` transform is affine: it displaces and scales
 * a symbol but can never curve it. Spine skeletons, `Graphics`, text and
 * composite subtrees therefore came out moved-but-flat.
 *
 * This takes the other route. The reel is rendered to a texture and that
 * texture is drawn through a mesh whose vertices are displaced by the same
 * cylinder projection, so EVERYTHING in the reel bends identically - skeletons,
 * atlas sprites, effects, text - and no symbol has to cooperate. It also side-
 * steps the atlas-frame problem in the per-symbol path outright, because a
 * render texture owns its whole source.
 *
 * What it costs: one extra render pass per reel per frame, and the reel is
 * resampled once, so hairline art is very slightly softer than drawing it
 * straight. Symbols are no longer real display objects on the stage from the
 * renderer's point of view, so anything that reaches into the reel expecting
 * screen-space hit testing has to go through `ReelSet.getCellQuad()` instead.
 */
export class ReelWarp extends Container implements Disposable {
  private readonly _mesh: MeshPlane;
  private _texture: RenderTexture;
  private _isDestroyed = false;
  private _width: number;
  private _height: number;
  private readonly _tickerRef: TickerRef;

  /**
   * @param _source the reel's own container. It is rendered to a texture rather
   *   than drawn, so the caller must keep it OUT of the scene graph
   * @param _renderer the renderer to draw the reel with
   * @param _curve the projection to displace vertices by
   * @param _axis the reel's travel projection
   * @param width screen width of the reel's box
   * @param height screen height of the reel's box
   */
  constructor(
    private readonly _source: Container,
    private readonly _renderer: Renderer,
    private readonly _curve: ReelCurve,
    private readonly _axis: ReelAxis,
    width: number,
    height: number,
    ticker: Ticker,
    private readonly _margin = 0,
  ) {
    super();
    // The texture covers the visible window PLUS a slot of buffer at each end.
    // Un-normalized, the projection sits inset from the window - the drum's
    // ends curve away from you - and it is the buffer cells that fill that
    // space, exactly as on a real machine where you can see a sliver of the
    // next symbol above and below.
    const grown = this._axis.toScreen(0, _margin * 2);
    this._width = Math.max(1, Math.ceil(width + Math.abs(grown.x)));
    this._height = Math.max(1, Math.ceil(height + Math.abs(grown.y)));
    this._texture = RenderTexture.create({
      width: this._width,
      height: this._height,
      resolution: _renderer.resolution,
    });
    this._mesh = new MeshPlane({
      texture: this._texture,
      verticesX: GRID,
      verticesY: GRID,
    });
    // `MeshPlane` sizes its grid from the texture and would rebuild it (and
    // undo our displacement) whenever that texture reports a resize.
    this._mesh.autoResize = false;
    this.addChild(this._mesh);
    this._displace();
    // Redraw every tick, not only while the strip moves: win pulses, cascade
    // destroys and the spotlight all animate symbols on a reel that is at rest,
    // and the texture is the only thing the player actually sees.
    this._tickerRef = new TickerRef(ticker);
    this._tickerRef.add(() => this.update());
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Redraw the reel into its texture. Called once per frame, after the motion
   * layer has moved the symbols and before the stage is drawn.
   */
  update(): void {
    if (this._isDestroyed) return;
    // The reel container carries the reel's own cross / main offset - reel 3
    // sits 300px along - because everything from `getCellBounds` to the
    // unmasked lift reads it. For the off-screen draw the strip has to land at
    // the texture's origin instead, or every reel but the first renders
    // entirely outside its own texture and comes out blank.
    //
    // Done by moving the container rather than through `render`'s `transform`
    // option: that transform does not replace the container's own, so the
    // offset survived it. Restored in the same synchronous block, so nothing
    // else can observe the container displaced.
    const { x, y } = this._source.position;
    // Park it AT the shift, not offset by it. Buffer cells sit at negative
    // main, so the margin brings them inside the texture and gives the ends of
    // the drum something to draw.
    const shift = this._axis.toScreen(0, this._margin);
    this._source.position.set(shift.x, shift.y);
    this._renderer.render({
      container: this._source,
      target: this._texture,
      clear: true,
    });
    this._source.position.set(x, y);
  }

  /** Re-measure after a reshape, and re-displace the grid. */
  resize(width: number, height: number): void {
    // Same margin the constructor added, or a reshape would silently drop the
    // buffer slack and clip the ends of the drum.
    const grown = this._axis.toScreen(0, this._margin * 2);
    const w = Math.max(1, Math.ceil(width + Math.abs(grown.x)));
    const h = Math.max(1, Math.ceil(height + Math.abs(grown.y)));
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    this._texture.resize(w, h);
    this._displace();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this._tickerRef.destroy();
    this._mesh.destroy();
    this._texture.destroy(true);
    super.destroy({ children: true });
  }

  /**
   * Push every grid vertex through the cylinder projection.
   *
   * The grid is laid out in screen space over the reel's box, so each vertex is
   * projected by mapping its MAIN coordinate along the drum and pulling its
   * CROSS coordinate toward the camera's axis by the same perspective factor
   * the symbols would have used. Run once per geometry change - the projection
   * does not move while the strip does, so there is nothing to do per frame.
   */
  private _displace(): void {
    const positions = this._mesh.geometry.positions;
    const focus = this._curve.focusCross;
    const span = GRID - 1;
    for (let i = 0; i < positions.length / 2; i++) {
      const gx = (i % GRID) / span;
      const gy = Math.floor(i / GRID) / span;
      // Screen grid -> axis-relative, so one loop serves both orientations.
      const texel = this._axis.toLocal(gx * this._width, gy * this._height);
      // Texture space starts a margin BEFORE the window, so undo that to get
      // the reel-local coordinate the projection is defined against.
      const main = texel.main - this._margin;
      const scale = this._curve.scaleAt(main);
      const screen = this._axis.toScreen(
        focus + (texel.cross - focus) * scale,
        this._curve.mapMain(main),
      );
      positions[i * 2] = screen.x;
      positions[i * 2 + 1] = screen.y;
    }
    this._mesh.geometry.positions = positions;
  }
}
