/**
 * One converter per SVG tag, plus the sink they all write into.
 *
 * This was a single 220-line closure inside `parseSvgToExcalidrawElements`
 * with a six-branch `if (tagName === …) else if` chain and two nested helpers
 * capturing a shared array. Splitting it out costs an explicit context object
 * and buys the ability to read one tag's rules without reading the other six.
 *
 * The dispatch is a lookup table rather than a chain so that adding a tag is a
 * map entry, and so that "which tags are handled" is one readable line.
 */
import { Point, signedArea } from '../regions/primitives';
import { resolveFilledRegions } from '../regions/fillRule';
import type { MultiPolygon } from '../regions/boolean';
import { bridgeHoles, regionToBridgedRings } from '../regions/bridge';
import { strokeToRegion } from '../strokeOutline';
import {
  Matrix2D,
  applyMatrix,
  getCombinedTransformMatrixUntil,
  matrixScale,
} from '../svg/matrix';
import {
  EllipseAttrs,
  ellipseRing,
  readEllipseAttrs,
  readPointsAttr,
  readRectAttrs,
  rectangleRing,
} from '../svg/geometry';
import { getPointsOnPath } from '../svg/pathFlatten';
import { ShapeStyle, getShapeStyle } from '../svg/paint';
import type { StyleMap } from '../svg/stylesheet';
import { applyClip, getVisibilityRegion, resolveVisibility } from '../svg/clipping';
import type { DropReason } from './diagnostics';
import type { RawShape } from './rawShape';

/**
 * Did clipping take anything away?
 *
 * Compared by area rather than by identity or vertex count, because the
 * boolean engine may return a geometrically identical ring with its vertices
 * renumbered. The tolerance is relative: a clip that removes less than a
 * thousandth of the shape is a rounding artefact of the intersection, not an
 * intent to cut.
 */
function coversSameArea(ring: Point[], pieces: Point[][]): boolean {
  const before = Math.abs(signedArea(ring));
  if (!(before > 0)) return true;
  const after = pieces.reduce((total, piece) => total + Math.abs(signedArea(piece)), 0);
  return Math.abs(before - after) / before < 1e-3;
}

/**
 * Collects raw shapes, applying the clip region and the hole-area floor that
 * every emitter shares.
 *
 * A class rather than a set of closures over a captured array: the array, the
 * tolerance and the minimum hole area travel together through five call sites
 * and one of them (`pushStroke`) needs all three.
 *
 * `minHoleArea` is the smallest hole worth keeping, in user units squared -
 * anything smaller cannot be seen, and bridging it would cost a visible
 * corridor (see `regionToBridgedRings`). `tolerance` is the curve flattening
 * tolerance, in the same units.
 */
export class RawShapeSink {
  readonly shapes: RawShape[] = [];

  constructor(
    private readonly minHoleArea: number,
    private readonly tolerance: number
  ) {}

  /** How many shapes exist so far; used to detect "drew nothing". */
  get count(): number {
    return this.shapes.length;
  }

  /** Emits one already-transformed ring as a filled shape, clipped. */
  pushRing(ring: Point[], fill: string, opacity: number, clipRegion: MultiPolygon | null): void {
    for (const clipped of applyClip(ring, clipRegion, this.minHoleArea)) {
      if (clipped.length < 3) continue;
      this.shapes.push({
        type: 'line',
        absPoints: clipped as [number, number][],
        fill,
        opacity,
      });
    }
  }

  /**
   * Emits an ellipse, clipped.
   *
   * An Excalidraw `ellipse` is parametric: it has a box, not a point list, so
   * there is nothing for a clip region to intersect. That is why a clipped
   * `<circle>` used to render whole.
   *
   * So when a clip actually cuts the ellipse, this emits the flattened outline
   * instead, which does have points and can be intersected. When the clip
   * leaves the ellipse alone - the common case, since most clips exist to trim
   * something else in the same group - the real ellipse is kept, because a
   * parametric ellipse stays smooth at every zoom level and a polygon does not.
   *
   * `ellipse` is in the element's own space; `matrix` maps it to root user
   * space. The flattening happens before the transform so that a rotation is
   * carried properly, which the axis-aligned rx/ry form cannot express.
   */
  pushEllipse(
    ellipse: EllipseAttrs,
    matrix: Matrix2D,
    fill: string,
    opacity: number,
    clipRegion: MultiPolygon | null
  ): void {
    const [cx, cy] = applyMatrix(matrix, [ellipse.cx, ellipse.cy]);
    const rx = ellipse.rx * Math.hypot(matrix[0], matrix[1]);
    const ry = ellipse.ry * Math.hypot(matrix[2], matrix[3]);
    const asEllipse = () => this.shapes.push({ type: 'ellipse', cx, cy, rx, ry, fill, opacity });

    if (!clipRegion) {
      asEllipse();
      return;
    }

    const ring = ellipseRing(ellipse, this.tolerance).map(pt => applyMatrix(matrix, pt));
    const clipped = applyClip(ring, clipRegion, this.minHoleArea);

    if (coversSameArea(ring, clipped)) {
      asEllipse();
      return;
    }

    for (const piece of clipped) {
      if (piece.length < 3) continue;
      this.shapes.push({ type: 'line', absPoints: piece as [number, number][], fill, opacity });
    }
  }

  /** Emits a resolved region as clipped, fill-only shapes. */
  pushRegion(region: MultiPolygon, color: string, opacity: number, clipRegion: MultiPolygon | null): void {
    if (!color || color === 'transparent') return;
    for (const ring of regionToBridgedRings(region, this.minHoleArea)) {
      this.pushRing(ring, color, opacity, clipRegion);
    }
  }

  /**
   * Emits a stroke as the *area* it covers rather than as an Excalidraw
   * stroke. See `strokeOutline.ts`: Excalidraw's stroke width is a style
   * property that does not scale with the element, so a stroked icon is only
   * correct at the size it was generated for.
   */
  pushStroke(
    subpathsLocal: Point[][],
    closed: boolean,
    style: ShapeStyle,
    matrix: Matrix2D,
    clipRegion: MultiPolygon | null
  ): void {
    if (style.isStrokeNone) return;
    if (!(style.strokeWidth > 0)) return;

    // Outlined in the element's OWN space, then transformed. A stroke is
    // circular in local space, so under a non-uniform transform its rendered
    // thickness depends on direction - `scale(3 1)` leaves a horizontal
    // line 1 unit thick, not sqrt(3). Collapsing the matrix to one scalar
    // got that wrong for every anisotropic transform.
    const localScale = matrixScale(matrix);
    const region = strokeToRegion(subpathsLocal, closed, {
      width: style.strokeWidth,
      cap: style.lineCap,
      join: style.lineJoin,
      miterLimit: style.miterLimit,
      tolerance: this.tolerance / (localScale || 1),
    });

    const transformed: MultiPolygon = region.map(polygon =>
      polygon.map(ring => ring.map(pt => applyMatrix(matrix, pt)))
    );

    this.pushRegion(transformed, style.stroke, style.strokeOpacityPct, clipRegion);
  }
}

/** Everything a per-tag converter needs that is not the element itself. */
export interface ConvertContext {
  doc: Document;
  styleMap: StyleMap;
  /** Curve flattening tolerance, in user units. */
  tolerance: number;
  sink: RawShapeSink;
}

/**
 * Converts one element of one tag. Returns why it drew nothing, or `null` when
 * it either drew something or the generic "produced nothing" check should
 * decide.
 */
type ShapeConverter = (
  el: Element,
  ctx: ConvertContext,
  clipRegion: MultiPolygon | null
) => DropReason | null;

const convertPath: ShapeConverter = (el, ctx, clipRegion) => {
  const d = el.getAttribute('d') || '';
  if (!d.trim()) return 'empty-geometry';

  const style = getShapeStyle(el, ctx.styleMap, ctx.doc);
  if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

  const matrix = getCombinedTransformMatrixUntil(el);
  const subpaths = getPointsOnPath(d, ctx.tolerance) as Point[][];
  if (subpaths.length === 0) return 'empty-geometry';

  if (!style.isFillNone) {
    // Holes are resolved in *user space*, before the transform is applied, so
    // the fill rule is evaluated against the geometry the author actually
    // wrote. A mirroring transform flips winding, which would otherwise invert
    // every nonzero decision.
    for (const region of resolveFilledRegions(subpaths, style.fillRule)) {
      const ring = bridgeHoles(region);
      if (ring.length < 3) continue;
      ctx.sink.pushRing(
        ring.map(pt => applyMatrix(matrix, pt)),
        style.fill,
        style.opacity,
        clipRegion
      );
    }
  }

  ctx.sink.pushStroke(subpaths, false, style, matrix, clipRegion);
  return null;
};

const convertPolyShape: ShapeConverter = (el, ctx, clipRegion) => {
  // Two points minimum, not three: a two-point `<polyline>` is a strokeable
  // line. `shapeToRings` deliberately requires three, because its callers
  // treat the result as an area. Unifying the two changes output.
  const localPoints = readPointsAttr(el);
  if (localPoints.length < 2) return 'empty-geometry';

  const style = getShapeStyle(el, ctx.styleMap, ctx.doc);
  if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

  const matrix = getCombinedTransformMatrixUntil(el);
  const isClosed = el.tagName.toLowerCase() === 'polygon';
  const absPoints: Point[] = localPoints.map(pt => applyMatrix(matrix, pt));

  // A `<polyline>` is not filled in SVG unless it declares a fill, and even
  // then its implicit closure only affects the fill, never the stroke.
  if (!style.isFillNone && absPoints.length >= 3) {
    ctx.sink.pushRing(absPoints, style.fill, style.opacity, clipRegion);
  }

  ctx.sink.pushStroke([localPoints], isClosed, style, matrix, clipRegion);
  return null;
};

const convertLine: ShapeConverter = (el, ctx, clipRegion) => {
  const x1 = parseFloat(el.getAttribute('x1') || '0');
  const y1 = parseFloat(el.getAttribute('y1') || '0');
  const x2 = parseFloat(el.getAttribute('x2') || '0');
  const y2 = parseFloat(el.getAttribute('y2') || '0');

  const style = getShapeStyle(el, ctx.styleMap, ctx.doc);
  // A `<line>` is never filled in SVG; with no stroke it paints nothing.
  if (style.isStrokeNone) return 'no-fill-no-stroke';

  const matrix = getCombinedTransformMatrixUntil(el);
  ctx.sink.pushStroke([[[x1, y1], [x2, y2]]], false, style, matrix, clipRegion);
  return null;
};

const convertRect: ShapeConverter = (el, ctx, clipRegion) => {
  const rect = readRectAttrs(el);
  if (!rect) return 'degenerate';

  const style = getShapeStyle(el, ctx.styleMap, ctx.doc);
  if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

  const matrix = getCombinedTransformMatrixUntil(el);
  const { x, y, width: w, height: h, rx, ry } = rect;

  // Only a rect whose radii reach both half-extents is actually an ellipse.
  // The old `maxR >= min(w, h) / 2.2` guess turned every pill (e.g. `5x2
  // rx=1`) into a full ellipse, losing its flat sides.
  const isEllipse = rx >= w / 2 - 1e-6 && ry >= h / 2 - 1e-6;
  if (isEllipse && !style.isFillNone) {
    ctx.sink.pushEllipse(
      { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 },
      matrix,
      style.fill,
      style.opacity,
      clipRegion
    );
  }

  const localRing = rectangleRing(rect, ctx.tolerance);
  const ring = localRing.map(pt => applyMatrix(matrix, pt));

  if (!isEllipse && !style.isFillNone) {
    // A filled rect is filled - it does not get a fabricated outline in its
    // own fill colour. That hack existed to keep sub-pixel bars visible back
    // when stroke widths were unscaled.
    ctx.sink.pushRing(ring, style.fill, style.opacity, clipRegion);
  }

  ctx.sink.pushStroke([localRing], true, style, matrix, clipRegion);
  return null;
};

const convertEllipse: ShapeConverter = (el, ctx, clipRegion) => {
  const ellipse = readEllipseAttrs(el);
  if (!ellipse) return 'degenerate';

  const style = getShapeStyle(el, ctx.styleMap, ctx.doc);
  if (style.isFillNone && style.isStrokeNone) return 'no-fill-no-stroke';

  const matrix = getCombinedTransformMatrixUntil(el);

  if (!style.isFillNone) {
    // The stroke is emitted separately below, as an annulus, so that it scales
    // with the element; an Excalidraw stroke would not.
    ctx.sink.pushEllipse(ellipse, matrix, style.fill, style.opacity, clipRegion);
  }

  if (!style.isStrokeNone) {
    ctx.sink.pushStroke([ellipseRing(ellipse, ctx.tolerance)], true, style, matrix, clipRegion);
  }

  return null;
};

/** Every tag the artwork pipeline knows how to draw. */
const SHAPE_CONVERTERS: Record<string, ShapeConverter> = {
  path: convertPath,
  polygon: convertPolyShape,
  polyline: convertPolyShape,
  line: convertLine,
  rect: convertRect,
  circle: convertEllipse,
  ellipse: convertEllipse,
};

/**
 * Converts one source element, returning why it drew nothing, or `null`.
 *
 * Extracted from the document loop so the *whole* body sits inside one `try`.
 * It previously did not: `getVisibilityRegion` runs `parsePath` over every
 * `<clipPath>` and `<mask>` in the document, and that throws on malformed or
 * SVGO-minified arc data (`a5 5 0 0110 0` tokenises as one number). Outside
 * the try, a single bad `d` in a clip path escaped to the function-level catch
 * and returned `[]` for the entire file.
 */
export function convertShapeElement(el: Element, ctx: ConvertContext): DropReason | null {
  const producedBefore = ctx.sink.count;

  if (el.closest('defs, clipPath, mask')) {
    // `clipPath`/`mask` content is consumed as clip geometry, not dropped;
    // reporting it would bury the real losses under noise from every
    // well-handled export. A bare `<defs>` shape, on the other hand, is
    // only ink if something instantiates it - and `<use>` is not resolved
    // on this path - so that one is a loss worth reporting.
    return el.closest('clipPath, mask') ? null : 'in-defs';
  }

  // Everything limiting where this element may paint (clip-path, mask), in
  // root user space. Resolved here rather than in the optimizer because this
  // is where the transform stack and the boolean engine live.
  const clipRegion = resolveVisibility(getVisibilityRegion(el, ctx.doc, ctx.tolerance));

  const convert = SHAPE_CONVERTERS[el.tagName.toLowerCase()];
  if (convert) {
    const reason = convert(el, ctx, clipRegion);
    if (reason) return reason;
  }

  // Passed every guard and still painted nothing. The distinction matters:
  // "clipped away" is usually an unsupported clip/mask idiom on our side,
  // "degenerate" is usually a collapsed transform or a sub-pixel shape.
  if (ctx.sink.count === producedBefore) {
    return clipRegion ? 'clipped-away' : 'degenerate';
  }
  return null;
}
