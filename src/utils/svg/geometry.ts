/**
 * Turning SVG shape elements into plain polygon rings, plus the small
 * numeric primitives that job needs.
 *
 * Separate from `pathRegions.ts` because nothing here knows about fill rules
 * or booleans - it is pure tessellation and attribute reading - and separate
 * from `clipping.ts` because clip paths, masks and the artwork pipeline all
 * flatten shapes the same way and must keep agreeing about how.
 *
 * `closeRing`, `boundsOf` and `arcSegmentCount` live here rather than in a
 * module of their own because they existed in three, six and four
 * near-identical copies respectively across this codebase, and every copy had
 * drifted. They are shared by `pathRegions.ts` and `strokeOutline.ts` too;
 * the numeric parameters that used to differ between copies are arguments, so
 * each caller keeps exactly the behaviour it had.
 */
import type { Point } from '../regions/primitives';
import { getPointsOnPath } from './pathFlatten';

/** Axis-aligned extent, in whatever space the points were given in. */
export interface XYBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Extent of several rings at once. Empty input gives an inverted box. */
export function boundsOfRings(rings: Iterable<Iterable<Point>>): XYBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Extent of one point list. `minX === Infinity` means there were no points. */
export function boundsOf(points: Iterable<Point>): XYBounds {
  return boundsOfRings([points]);
}

/**
 * Number of straight segments needed to approximate an arc of `sweep` radians
 * on a circle of `radius` to within `tolerance`, clamped to `[min, max]`.
 *
 * Sagitta of a chord subtending angle t on a circle of radius r is
 * r * (1 - cos(t/2)); solve for the t that keeps it under tolerance.
 *
 * The clamps are arguments because the four call sites genuinely want
 * different ones: a rounded rect corner may be as coarse as two segments, a
 * standalone round cap may not.
 */
export function arcSegmentCount(
  sweep: number,
  radius: number,
  tolerance: number,
  min: number,
  max: number
): number {
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
  const maxAngle = 2 * Math.acos(ratio);
  return Math.max(min, Math.min(max, Math.ceil(Math.abs(sweep) / maxAngle)));
}

/**
 * Segments needed to approximate a quarter-ellipse of the given radii to
 * within `tolerance` user units.
 *
 * Excalidraw's `roundness` cannot express a specific radius, so rounded
 * corners have to become real geometry. Deriving the count from the radius
 * keeps a 0.24-unit corner cheap and a 6-unit corner smooth.
 */
export function arcSegments(rx: number, ry: number, tolerance: number): number {
  const radius = Math.max(rx, ry);
  if (radius <= 0) return 1;
  return arcSegmentCount(Math.PI / 2, radius, tolerance, 2, 64);
}

/**
 * Appends the first point to the end of a ring unless it is already there.
 *
 * Excalidraw refuses to fill a `line` element unless its point list forms a
 * closed loop (`isPathALoop`: distance(first, last) <= LINE_CONFIRM_THRESHOLD).
 *
 * SVG, on the other hand, implicitly closes every filled subpath. So a path
 * like `M0 0 L10 0 L10 10` renders as a filled triangle in a browser but as
 * *nothing* in Excalidraw. Compound "donut" paths bridged by `bridgeHoles` are
 * also left open by construction. We therefore close every ring we intend to
 * fill.
 *
 * `epsilon` is an argument because the three copies this replaces used 1e-6
 * (output-space rings, where a micro-unit gap is genuinely closed) and 1e-9
 * (user-space boolean input, where it is not).
 */
export function closeRing<T extends Point>(points: T[], epsilon: number): T[] {
  if (points.length < 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= epsilon) return points.slice();
  return [...points, [first[0], first[1]] as T];
}

/** Axis-aligned rectangle geometry, after the per-spec rx/ry clamping. */
export interface RectAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
}

/**
 * Reads `<rect>` geometry, or `null` when it is degenerate.
 *
 * Per spec an omitted rx/ry mirrors the other, and both clamp to half the
 * corresponding side.
 */
export function readRectAttrs(el: Element): RectAttrs | null {
  const x = parseFloat(el.getAttribute('x') || '0');
  const y = parseFloat(el.getAttribute('y') || '0');
  const width = parseFloat(el.getAttribute('width') || '0');
  const height = parseFloat(el.getAttribute('height') || '0');
  if (!(width > 0) || !(height > 0)) return null;

  const rxAttr = el.getAttribute('rx');
  const ryAttr = el.getAttribute('ry');
  const rxRaw = rxAttr !== null ? parseFloat(rxAttr) : ryAttr !== null ? parseFloat(ryAttr) : 0;
  const ryRaw = ryAttr !== null ? parseFloat(ryAttr) : rxRaw;

  return {
    x,
    y,
    width,
    height,
    rx: Math.min(Math.max(Number.isFinite(rxRaw) ? rxRaw : 0, 0), width / 2),
    ry: Math.min(Math.max(Number.isFinite(ryRaw) ? ryRaw : 0, 0), height / 2),
  };
}

export interface EllipseAttrs {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Reads `<circle>`/`<ellipse>` geometry, or `null` when it is degenerate.
 * A `<circle>` is an ellipse whose `r` fills both radii.
 */
export function readEllipseAttrs(el: Element): EllipseAttrs | null {
  const isCircle = el.tagName.toLowerCase() === 'circle';
  const cx = parseFloat(el.getAttribute('cx') || '0');
  const cy = parseFloat(el.getAttribute('cy') || '0');
  const rx = isCircle ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('rx') || '0');
  const ry = isCircle ? rx : parseFloat(el.getAttribute('ry') || '0');
  if (!(rx > 0) || !(ry > 0)) return null;
  return { cx, cy, rx, ry };
}

/**
 * Reads the coordinate pairs of a `<polygon>`/`<polyline>` `points` attribute.
 *
 * A trailing lone coordinate is discarded, as browsers do. Callers apply their
 * own minimum-length threshold; the two in this codebase deliberately differ
 * (see `shapeToRings` and the polygon converter).
 */
export function readPointsAttr(el: Element): Point[] {
  const coords = (el.getAttribute('points') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => !isNaN(n));

  const points: Point[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) points.push([coords[i], coords[i + 1]]);
  return points;
}

/**
 * Closed ring for a `<rect>`, with elliptical corners when rx/ry are set.
 *
 * Emitted counter-clockwise in SVG's y-down space so the winding matches every
 * other ring this module produces.
 */
export function rectangleRing(rect: RectAttrs, tolerance: number): Point[] {
  const { x, y, width: w, height: h, rx, ry } = rect;

  if (rx <= 0 || ry <= 0) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  }

  const segments = arcSegments(rx, ry, tolerance);
  const ring: Point[] = [];
  const corners: Array<{ cx: number; cy: number; from: number }> = [
    { cx: x + w - rx, cy: y + ry, from: -Math.PI / 2 }, // top-right
    { cx: x + w - rx, cy: y + h - ry, from: 0 }, // bottom-right
    { cx: x + rx, cy: y + h - ry, from: Math.PI / 2 }, // bottom-left
    { cx: x + rx, cy: y + ry, from: Math.PI }, // top-left
  ];

  ring.push([x + rx, y]);
  for (const { cx, cy, from } of corners) {
    for (let i = 0; i <= segments; i++) {
      const angle = from + (Math.PI / 2) * (i / segments);
      ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
  }

  return ring;
}

/** Full ellipse as one ring, tessellated to `tolerance`. */
export function ellipseRing(ellipse: EllipseAttrs, tolerance: number): Point[] {
  const { cx, cy, rx, ry } = ellipse;
  const ring: Point[] = [];
  const segments = arcSegments(rx, ry, tolerance) * 4;
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    ring.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return ring;
}

/**
 * Flattens any SVG shape element into closed rings in its own user space.
 *
 * Areas only. `<line>` is deliberately absent: a line encloses nothing, so a
 * `<line>` inside a `<clipPath>` contributes no clip area, which is what the
 * spec says. For the *bounding box* of a line, which is a different question
 * with a different answer, see `shapeBoundsPoints`.
 */
export function shapeToRings(el: Element, tolerance: number): Point[][] {
  const tag = el.tagName.toLowerCase();

  if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    if (!d.trim()) return [];
    return getPointsOnPath(d, tolerance) as Point[][];
  }

  if (tag === 'rect') {
    const rect = readRectAttrs(el);
    return rect ? [rectangleRing(rect, tolerance)] : [];
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const ellipse = readEllipseAttrs(el);
    return ellipse ? [ellipseRing(ellipse, tolerance)] : [];
  }

  if (tag === 'polygon' || tag === 'polyline') {
    // Three points minimum, because every consumer of this function treats
    // the result as an area. The artwork converter uses two, because there a
    // two-point polyline is still strokeable. Unifying the thresholds changes
    // output, so they stay apart and stay commented.
    const ring = readPointsAttr(el);
    return ring.length >= 3 ? [ring] : [];
  }

  return [];
}

/**
 * Points that define a shape's geometry bounding box, in its own user space.
 *
 * Almost the same as `shapeToRings`, and different in exactly one way: a
 * `<line>` has a bounding box even though it has no area. Its box is the box
 * of its two endpoints, per the SVG geometry-box rules, and a horizontal line
 * legitimately gives a box of zero height.
 *
 * Keeping this separate from `shapeToRings` is the point. A `<line>` inside a
 * `<clipPath>` must still clip nothing away, and folding the two together
 * would have given it area.
 *
 * Only the *upload* path can reach this with a real `<line>`, which is why
 * there is no torture fixture for it - the harness runs SVGO first, and
 * SVGO's `convertShapeToPath` rewrites every `<line>` as a `<path>` before the
 * converter sees it. `geometry.test.ts` and `objectBounds.test.ts` cover it
 * directly instead.
 */
export function shapeBoundsPoints(el: Element, tolerance: number): Point[][] {
  if (el.tagName.toLowerCase() === 'line') {
    const at = (name: string) => parseFloat(el.getAttribute(name) || '0');
    const ends: Point[] = [
      [at('x1'), at('y1')],
      [at('x2'), at('y2')],
    ];
    return ends.every(pt => pt.every(Number.isFinite)) ? [ends] : [];
  }

  return shapeToRings(el, tolerance);
}
