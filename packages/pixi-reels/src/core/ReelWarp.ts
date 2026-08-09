import { Container, MeshPlane, RenderTexture, type Renderer, type Ticker } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';
import type { ReelAxis } from './ReelAxis.js';
import type { ReelCurve } from './ReelCurve.js';

/**
 * Vertices per axis. The quality knob: too few and the drum reads as flat
 * facets, too many and every reel costs geometry for a smooth curve. 16 is well
 * past visible faceting at slot-cell sizes.
 */
const GRID = 16;

/**
 * Bend a whole reel, whatever is inside it.
 *
 * {@link ReelCurve}'s per-symbol projection only bends content that IS a
 * texture: a `Container` transform is affine, so Spine skeletons, `Graphics`,
 * text and composites come out moved-but-flat.
 *
 * This renders the reel to a texture and draws it through a mesh whose
 * vertices carry the same projection, so everything inside bends and no symbol
 * cooperates. It also sidesteps the per-symbol path's atlas-frame problem,
 * since a render texture owns its whole source.
 *
 * Costs one render pass per reel per frame and one resample, so hairline art is
 * marginally softer. Symbols are no longer real display objects to the
 * renderer, so use `ReelSet.getCellQuad()` rather than screen-space hit tests.
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
    private readonly _bleed = 0,
  ) {
    super();
    // Texture covers the window plus a slot of buffer at each end of the
    // strip: the drum's ends curve away from the window edges and the buffer
    // cells fill that band.
    //
    // `_bleed` does the same ACROSS the strip, for art wider than its cell -
    // an overflowing mystery plate, leaves past the tile. Without it the
    // overhang is sliced at the texture edge.
    const grown = this._axis.toScreen(_bleed * 2, _margin * 2);
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
    // destroys and the spotlight animate symbols on a reel at rest, and the
    // texture is the only thing the player sees.
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
    // The container carries the reel's own offset - reel 3 sits 300px along -
    // because everything from `getCellBounds` to the unmasked lift reads it.
    // The off-screen draw needs the strip at the texture's origin instead, or
    // every reel but the first renders outside its texture and comes out blank.
    //
    // Moving the container, not `render`'s `transform` option: that transform
    // does not replace the container's own, so the offset survived it.
    // Restored in the same synchronous block.
    const { x, y } = this._source.position;
    // Park it AT the shift, not offset by it. Buffer cells sit at negative
    // main, so the margin brings them inside the texture.
    const shift = this._axis.toScreen(this._bleed, this._margin);
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
    // Same margin the constructor added, or a reshape drops the buffer slack
    // and clips the drum's ends.
    const grown = this._axis.toScreen(this._bleed * 2, this._margin * 2);
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
   * Grid is screen-space over the reel's box: map each vertex's MAIN
   * coordinate along the drum, pull its CROSS coordinate toward the camera's
   * axis by the same perspective factor. Once per geometry change - the
   * projection does not move while the strip does.
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
      // Texture space starts a margin before the window and a bleed across it;
      // undo both for the reel-local coordinate the projection uses.
      const main = texel.main - this._margin;
      const cross = texel.cross - this._bleed;
      const scale = this._curve.scaleAt(main);
      const screen = this._axis.toScreen(
        focus + (cross - focus) * scale,
        this._curve.mapMain(main),
      );
      positions[i * 2] = screen.x;
      positions[i * 2 + 1] = screen.y;
    }
    this._mesh.geometry.positions = positions;
  }
}
