import polygonClipping from 'polygon-clipping';
import { boundsOfRings, closeRing, ringGap } from './geometry';

/**
 * Rings, and the one question that decides whether artwork survives
 * conversion: given the subpaths of a `<path>` and its declared fill rule,
 * which areas are painted and which are holes.
 *
 * Three rules decide it, and all three have been got wrong here before:
 *
 *  - **Hole-ness comes from the fill rule, not from winding direction.** A
 *    subpath is a hole when the fill rule says the area just inside it is
 *    empty. `nonzero` (the SVG default) and `evenodd` disagree, and an author
 *    is free to wind every subpath the same way and rely on `evenodd`.
 *
 *  - **Containment is point-in-polygon, not bounding box.** Two disjoint
 *    shapes can easily have nested bounding boxes; punching one out of the
 *    other deletes real artwork.
 *
 *  - **Orientation is never forced.** `polygon-clipping` returns canonical
 *    winding (outer one way, holes the other), which is correct under both
 *    fill rules, so nothing downstream needs to reverse a ring.
 *
 * The boolean engine that canonicalises the answer is `booleans.ts`.
 */

// ---------------------------------------------------------------------------
// Ring primitives
// ---------------------------------------------------------------------------

/**
 * Owns the vocabulary every other module in `regions/` speaks: the ring and
 * polygon types, the tolerance they are compared at, and the handful of pure
 * predicates over a single ring.
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

/** A set of disjoint regions, each `[outerRing, ...holeRings]`. Matches
 *  `polygon-clipping`'s MultiPolygon layout. */
export type MultiPolygon = Point[][][];

export const EPSILON = 1e-9;

/**
 * Strips a trailing point that merely repeats the first one.
 *
 * Critically, this is conditional. `pointsOnPath` only appends the start point
 * for a subpath that carries an explicit `Z`; unconditionally slicing off the
 * last element deletes a real vertex from every
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
function pointInRing(point: Point, ring: Ring): boolean {
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
function windingNumber(point: Point, ring: Ring): number {
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

function distanceToRing(p: Point, ring: Ring): number {
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

// ---------------------------------------------------------------------------
// Fill-rule classification
// ---------------------------------------------------------------------------

// --- tuning constants for `representativePoints` ---------------------------

/** Fewer vertices than this and the ring encloses no area worth sampling. */
const MIN_RING_VERTICES = 3;
/** How many longest edges of a ring are considered as sampling sites. */
const CANDIDATE_EDGES = 12;
/** Nominal inward step off an edge midpoint, as a fraction of that edge's length. */
const OFFSET_EDGE_FRACTION = 0.02;
/** Cap on that step, as a fraction of the clearance to the nearest other ring. */
const OFFSET_CLEARANCE_FRACTION = 0.25;
/** Floor on that step, so an edge crowded by a neighbour still leaves the boundary. */
const MIN_OFFSET_EDGE_FRACTION = 1e-4;
/** `polygon-clipping` returns *closed* rings, so a triangle is four points. */
const MIN_CLOSED_RING_VERTICES = 4;

function isFilled(point: Point, rings: Ring[], rule: FillRule): boolean {
  if (rule === 'evenodd') {
    let crossings = 0;
    for (const ring of rings) if (pointInRing(point, ring)) crossings++;
    return crossings % 2 === 1;
  }
  let winding = 0;
  for (const ring of rings) winding += windingNumber(point, ring);
  return winding !== 0;
}

/**
 * A point strictly inside `ring`, positioned where `ring` is locally isolated
 * from every other ring in the same path.
 *
 * Isolation is the whole point. Sampling next to an arbitrary edge is not
 * enough: in `Security.svg` the outer ring and its hole share the vertical
 * segment `x = 8`, which is also the outer ring's *longest* edge. Offsetting
 * inward from its midpoint lands inside the hole, the winding sums to zero,
 * and the entire shape is classified as empty. Choosing the edge with the best
 * clearance from other rings makes the fill-rule evaluation unambiguous.
 */
function representativePoints(rings: Ring[]): Array<Point | null> {
  return rings.map((ring, index) => {
    if (ring.length < MIN_RING_VERTICES) return null;

    const others = rings.filter((_, i) => i !== index);

    const edges: Array<{ index: number; length: number }> = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length > EPSILON) edges.push({ index: i, length });
    }
    if (edges.length === 0) return null;

    edges.sort((p, q) => q.length - p.length);

    let best: Point | null = null;
    let bestScore = -Infinity;

    for (const edge of edges.slice(0, CANDIDATE_EDGES)) {
      const a = ring[edge.index];
      const b = ring[(edge.index + 1) % ring.length];
      const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

      let clearance = Infinity;
      for (const other of others) {
        const d = distanceToRing(midpoint, other);
        if (d < clearance) clearance = d;
      }

      // Prefer a long edge that is far from every other ring; a zero-clearance
      // edge (shared or touching) scores zero and is only used as a last resort.
      const score = Math.min(clearance, edge.length);
      if (score <= bestScore) continue;

      const nx = -(b[1] - a[1]) / edge.length;
      const ny = (b[0] - a[0]) / edge.length;
      const offset = Math.max(
        Math.min(
          edge.length * OFFSET_EDGE_FRACTION,
          Number.isFinite(clearance) ? clearance * OFFSET_CLEARANCE_FRACTION : Infinity
        ),
        edge.length * MIN_OFFSET_EDGE_FRACTION
      );

      const forward: Point = [midpoint[0] + nx * offset, midpoint[1] + ny * offset];
      const backward: Point = [midpoint[0] - nx * offset, midpoint[1] - ny * offset];
      const inForward = pointInRing(forward, ring);
      const inBackward = pointInRing(backward, ring);

      if (inForward === inBackward) continue;

      best = inForward ? forward : backward;
      bestScore = score;
    }

    return best;
  });
}

/**
 * Resolves the flattened subpaths of one path element into filled regions.
 *
 * Two stages: an exact per-ring classification under the declared fill rule,
 * then a boolean `union` that canonicalises the result. The union is what makes
 * overlapping siblings and self-intersecting input safe - classification alone
 * cannot resolve those.
 */
export function resolveFilledRegions(subpaths: Point[][], rule: FillRule): PolygonWithHoles[] {
  const rings = subpaths.map(normaliseRing).filter(ring => ring.length >= MIN_RING_VERTICES);
  if (rings.length === 0) return [];

  if (rings.length === 1) {
    return [{ outer: rings[0], holes: [] }];
  }

  const samples = representativePoints(rings);
  const areas = rings.map(ring => Math.abs(signedArea(ring)));

  const filled = rings.map((_, i) => {
    const sample = samples[i];
    // A ring we cannot sample is assumed solid; dropping it would delete
    // artwork, whereas over-filling is at worst a local defect.
    return sample ? isFilled(sample, rings, rule) : true;
  });

  // Immediate parent = smallest ring that contains our sample point.
  const parents = rings.map((_, i) => {
    const sample = samples[i];
    if (!sample) return -1;
    let best = -1;
    for (let j = 0; j < rings.length; j++) {
      if (i === j) continue;
      if (!pointInRing(sample, rings[j])) continue;
      if (best === -1 || areas[j] < areas[best]) best = j;
    }
    return best;
  });

  const polygons: PolygonWithHoles[] = [];
  for (let i = 0; i < rings.length; i++) {
    if (!filled[i]) continue;
    const holes: Ring[] = [];
    for (let j = 0; j < rings.length; j++) {
      if (j === i || filled[j] || parents[j] !== i) continue;
      holes.push(rings[j]);
    }
    polygons.push({ outer: rings[i], holes });
  }

  if (polygons.length === 0) return [];

  try {
    const input = polygons.map(p => [toClosed(p.outer), ...p.holes.map(toClosed)]);
    const union = polygonClipping.union(input as any);
    const resolved: PolygonWithHoles[] = [];

    for (const polygon of union) {
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < MIN_CLOSED_RING_VERTICES) continue;
      resolved.push({
        outer: normaliseRing(outer as Point[]),
        holes: holes
          .map(h => normaliseRing(h as Point[]))
          .filter(h => h.length >= MIN_RING_VERTICES),
      });
    }

    if (resolved.length > 0) return resolved;
  } catch {
    // polygon-clipping is numerically fragile on degenerate input. The
    // classified regions are still correct for well-formed artwork, so fall
    // through rather than dropping the shape entirely.
  }

  return polygons;
}
