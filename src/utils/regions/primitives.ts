import { boundsOfRings, closeRing, ringGap } from '../svg/geometry';
import type { MultiPolygon } from './boolean';

/**
 * Owns the vocabulary every other module in `regions/` speaks: the ring and
 * polygon types, the tolerance they are compared at, and the handful of pure
 * predicates over a single ring.
 *
 * Separate because nothing here knows about fill rules or booleans. These are
 * the functions that must stay dependency-free so `fillRule.ts`, `boolean.ts`
 * and `bridge.ts` can each import them without importing each other.
 */

export type Point = [number, number];
/** A closed loop, stored without a duplicated final point. */
export type Ring = Point[];

/**
 * **Open vs closed rings.** Both conventions are `Point[]`, so the compiler
 * cannot tell them apart and a ring round-trips between them roughly seven
 * times per shape. The rule:
 *
 *  - A `Ring` is **open**: the loop is implied, the first point is not
 *    repeated at the end. Everything in this package produces and consumes
 *    open rings, and every loop here closes them with `% ring.length`.
 *  - `toClosed` produces the **closed** form - first point repeated last -
 *    which is the only thing `polygon-clipping` accepts.
 *  - `normaliseRing` is the inverse: it takes whatever came back and returns
 *    the open form.
 *
 * The types are deliberately not branded. Doing so would be correct but would
 * touch every call site in the converter, and the pair above is small enough
 * to hold in your head: if you are about to call `polygon-clipping`, close;
 * the moment you get a ring back from it, normalise.
 */

export interface PolygonWithHoles {
  outer: Ring;
  holes: Ring[];
}

export type FillRule = 'nonzero' | 'evenodd';

export const EPSILON = 1e-9;

/**
 * Strips a trailing point that merely repeats the first one.
 *
 * Critically, this is conditional. `pointsOnPath` only appends the start point
 * for a subpath that carries an explicit `Z`; unconditionally slicing off the
 * last element - as the old code did - deleted a real vertex from every
 * unclosed subpath.
 */
export function normaliseRing(points: Point[]): Ring {
  if (points.length < 2) return points.slice();
  return ringGap(points) <= EPSILON ? points.slice(0, -1) : points.slice();
}

/**
 * Appends the first point to the end of a ring for `polygon-clipping`, which
 * requires explicitly closed rings. `EPSILON` here is 1e-9, not the 1e-6 the
 * emitter uses: these are user-space coordinates feeding a boolean engine, and
 * a micro-unit gap is a real gap.
 */
export const toClosed = (ring: Ring): Point[] => closeRing(ring, EPSILON);

export function signedArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return area / 2;
}

/** Even-odd containment of `point` in a single ring. */
export function pointInRing(point: Point, ring: Ring): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > py !== b[1] > py) {
      const x = a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** Winding contribution of a single ring around `point`. */
export function windingNumber(point: Point, ring: Ring): number {
  const [px, py] = point;
  let winding = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const side = (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]);
    if (a[1] <= py) {
      if (b[1] > py && side > 0) winding++;
    } else if (b[1] <= py && side < 0) {
      winding--;
    }
  }
  return winding;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= EPSILON) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distanceToRing(p: Point, ring: Ring): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]);
    if (d < best) best = d;
  }
  return best;
}

/** Axis-aligned rectangle as a single-polygon region. */
export function rectRegion(x: number, y: number, width: number, height: number): MultiPolygon {
  return [
    [
      [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
        [x, y],
      ],
    ],
  ];
}

/** Extent of a region's outer rings; holes cannot extend past them. */
export function multiPolygonBounds(region: MultiPolygon) {
  return boundsOfRings(region.map(polygon => polygon[0] ?? []));
}
