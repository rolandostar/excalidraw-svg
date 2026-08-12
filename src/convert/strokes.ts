import { EPSILON, MultiPolygon, Point, signedArea } from './regions';
import {
  differenceMultiPolygons,
  normaliseRegion,
  robustUnion,
} from './booleans';
import { arcSegmentCount, closeRing, ringGap } from './geometry';

/**
 * Converts a stroked polyline into the filled region that stroke covers.
 *
 * Two independent reasons this has to happen:
 *
 *  1. **Excalidraw's `strokeWidth` does not scale with the element.** It is a
 *     style property, so resizing a stroked icon on the canvas keeps the
 *     stroke at its original thickness while the geometry grows - the artwork
 *     is only correct at the exact size it was generated for. A filled region
 *     scales exactly.
 *
 *  2. **Excalidraw hardcodes round caps and joins** when it renders a `line`
 *     element. SVG defaults to butt caps and miter joins, so every square
 *     corner and flat end came out rounded.
 *
 * The outline is built by unioning one quad per segment with an explicit join
 * wedge at every vertex and a cap at each end, rather than by offsetting the
 * path analytically. It is more boolean work, but it is correct for
 * self-intersecting and doubling-back paths, which analytic offsetting is not.
 */

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface StrokeStyle {
  width: number;
  cap: LineCap;
  join: LineJoin;
  miterLimit: number;
  /** Tolerance for tessellating round caps/joins, in the same units as the points. */
  tolerance: number;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPSILON) out.push(p);
  }
  return out;
}

function circle(center: Point, radius: number, tolerance: number): Point[] {
  const segments = arcSegmentCount(2 * Math.PI, radius, tolerance, 8, 128);
  const ring: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    ring.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Offsets a polyline to one side by `delta`, inserting join geometry.
 *
 * This is the core of the outliner. The obvious alternative - emit one quad
 * per segment and union them - is correct in principle but catastrophic in
 * practice on curves: a flattened arc has dozens of segments, the quads cross
 * on the inside of every turn, and the boolean engine faithfully reports each
 * crossing as a hole of ~5e-8 square units. Those holes are invisible, but
 * bridging them into an Excalidraw ring costs one zero-width corridor each,
 * and the corridors rasterise as radial hairlines across the stroke. Offsetting
 * directly produces one ring with no spurious holes at all.
 */
function offsetSide(pts: Point[], directions: Point[], delta: number, closed: boolean, style: StrokeStyle): Point[] {
  const out: Point[] = [];
  const count = pts.length;

  const pushJoin = (index: number, incoming: Point, outgoing: Point) => {
    const vertex = pts[index];
    const n1: Point = [-incoming[1] * delta, incoming[0] * delta];
    const n2: Point = [-outgoing[1] * delta, outgoing[0] * delta];

    const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    const cosHalf = Math.sqrt(Math.max(0, (1 + dot) / 2));

    const bx = n1[0] + n2[0];
    const by = n1[1] + n2[1];
    const bLen = Math.hypot(bx, by);

    // Near-reversal, or a miter longer than the limit: fall back to the two
    // offset points, which is exactly a bevel.
    if (bLen <= EPSILON || cosHalf <= EPSILON || 1 / cosHalf > style.miterLimit || style.join !== 'miter') {
      if (style.join === 'round' && bLen > EPSILON) {
        const radius = Math.abs(delta);
        const start = Math.atan2(n1[1], n1[0]);
        const end = Math.atan2(n2[1], n2[0]);
        let sweep = end - start;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        const steps = arcSegmentCount(sweep, radius, style.tolerance, 1, 32);
        for (let k = 0; k <= steps; k++) {
          const angle = start + (sweep * k) / steps;
          out.push([vertex[0] + radius * Math.cos(angle), vertex[1] + radius * Math.sin(angle)]);
        }
        return;
      }
      out.push([vertex[0] + n1[0], vertex[1] + n1[1]]);
      out.push([vertex[0] + n2[0], vertex[1] + n2[1]]);
      return;
    }

    const tip = Math.abs(delta) / cosHalf;
    out.push([vertex[0] + (bx / bLen) * tip, vertex[1] + (by / bLen) * tip]);
  };

  if (!closed) {
    const n0: Point = [-directions[0][1] * delta, directions[0][0] * delta];
    out.push([pts[0][0] + n0[0], pts[0][1] + n0[1]]);
  }

  const first = closed ? 0 : 1;
  const last = closed ? count - 1 : count - 2;
  for (let i = first; i <= last; i++) {
    pushJoin(i, directions[(i - 1 + directions.length) % directions.length], directions[i % directions.length]);
  }

  if (!closed) {
    const nLast: Point = [
      -directions[directions.length - 1][1] * delta,
      directions[directions.length - 1][0] * delta,
    ];
    out.push([pts[count - 1][0] + nLast[0], pts[count - 1][1] + nLast[1]]);
  }

  return out;
}

function capPoints(end: Point, direction: Point, half: number, cap: LineCap, tolerance: number): Point[] {
  const nx = -direction[1] * half;
  const ny = direction[0] * half;

  if (cap === 'square') {
    const ex = direction[0] * half;
    const ey = direction[1] * half;
    return [
      [end[0] + nx + ex, end[1] + ny + ey],
      [end[0] - nx + ex, end[1] - ny + ey],
    ];
  }

  if (cap === 'round') {
    const steps = arcSegmentCount(Math.PI, half, tolerance, 2, 64);
    const start = Math.atan2(ny, nx);
    const points: Point[] = [];
    for (let k = 0; k <= steps; k++) {
      const angle = start - (Math.PI * k) / steps;
      points.push([end[0] + half * Math.cos(angle), end[1] + half * Math.sin(angle)]);
    }
    return points;
  }

  return [];
}

/** Region covered by stroking one polyline. */

function outlinePolyline(points: Point[], closed: boolean, style: StrokeStyle): Point[][][] {
  const half = style.width / 2;
  if (half <= 0) return [];

  let pts = dedupe(points);

  // A subpath terminated by `Z` arrives with its start point repeated. That
  // makes it closed regardless of what the caller assumed, and its seam needs
  // a join rather than two caps.
  if (pts.length > 2 && ringGap(pts) <= EPSILON) {
    pts = pts.slice(0, -1);
    closed = true;
  }

  if (pts.length === 0) return [];

  if (pts.length === 1 || (closed && pts.length < 3)) {
    // A zero-length subpath only paints under a round or square cap.
    if (style.cap === 'round') return [[circle(pts[0], half, style.tolerance)]];
    if (style.cap === 'square') {
      const [x, y] = pts[0];
      const square: Point[] = [
        [x - half, y - half],
        [x + half, y - half],
        [x + half, y + half],
        [x - half, y + half],
      ];
      return [[closeRing(square, EPSILON)]];
    }
    return [];
  }

  const segmentCount = closed ? pts.length : pts.length - 1;
  const directions: Point[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    directions.push([(b[0] - a[0]) / length, (b[1] - a[1]) / length]);
  }

  if (closed) {
    // A closed stroke is an annulus. Each offset ring is normalised on its own
    // first - either can self-intersect at a sharp corner - and the hole is
    // then produced by a real difference. Normalising the two together as one
    // polygon instead loses the hole entirely.
    // Which sign offsets *outward* depends on the ring's winding, which the
    // source controls. Choosing by area instead of assuming a direction: a
    // clockwise ring silently produced an empty difference and dropped the
    // whole stroke.
    const a = offsetSide(pts, directions, half, true, style);
    const b = offsetSide(pts, directions, -half, true, style);
    if (a.length < 3 && b.length < 3) return [];

    const area = (ring: Point[]) => Math.abs(signedArea(ring));

    const [outerRing, innerRing] = area(a) >= area(b) ? [a, b] : [b, a];
    const outer = normaliseRegion([[closeRing(outerRing, EPSILON)]]);
    if (outer.length === 0) return [];
    if (innerRing.length < 3) return outer as Point[][][];

    const inner = normaliseRegion([[closeRing(innerRing, EPSILON)]]);
    return differenceMultiPolygons(outer, inner) as Point[][][];
  }

  const forward = offsetSide(pts, directions, half, false, style);
  const backward = offsetSide(pts, directions, -half, false, style).reverse();

  const endCap = capPoints(pts[pts.length - 1], directions[directions.length - 1], half, style.cap, style.tolerance);
  const startCap = capPoints(pts[0], [-directions[0][0], -directions[0][1]], half, style.cap, style.tolerance);

  const ring = [...forward, ...endCap, ...backward, ...startCap];
  if (ring.length < 3) return [];

  // An open stroke is a single ring, which crosses itself on the inside of any
  // sharp turn; normalising turns that crossing into proper geometry instead
  // of a punched-out lobe.
  return normaliseRegion([[closeRing(ring, EPSILON)]]) as Point[][][];
}

/**
 * Region covered by stroking a set of subpaths, as a single resolved
 * MultiPolygon. Returns an empty array when nothing is painted.
 */
export function strokeToRegion(subpaths: Point[][], closed: boolean, style: StrokeStyle): MultiPolygon {
  if (!(style.width > 0)) return [];

  const pieces: Point[][][] = [];
  for (const subpath of subpaths) {
    pieces.push(...outlinePolyline(subpath, closed, style));
  }

  if (pieces.length === 0) return [];

  // Each piece is one polygon; wrap it as a single-polygon MultiPolygon so the
  // union sees a flat list of regions to merge. `outlinePolyline` has already
  // normalised each piece on its own - that is where the self-intersection an
  // offset leaves on the inside of a sharp turn gets resolved - so a single
  // piece needs nothing further and is returned as-is.
  return pieces.length === 1
    ? ([pieces[0]] as MultiPolygon)
    : robustUnion(pieces.map(piece => [piece] as MultiPolygon));
}
