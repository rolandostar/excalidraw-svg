import polygonClipping from 'polygon-clipping';

import {
  EPSILON,
  distanceToRing,
  normaliseRing,
  pointInRing,
  signedArea,
  toClosed,
  windingNumber,
  type FillRule,
  type Point,
  type PolygonWithHoles,
  type Ring,
} from './primitives';

/**
 * Owns the only question that decides whether artwork survives conversion:
 * given the subpaths of one `<path>` and its declared fill rule, which areas
 * are painted and which are holes.
 *
 * Separate from `boolean.ts` because this is *classification* - exact,
 * per-ring, and driven by the SVG spec. The boolean engine that follows it
 * only canonicalises an answer this file has already produced.
 *
 * Three rules decide it, and all three have been got wrong here before:
 *
 *  - **Hole-ness comes from the fill rule, not from winding direction.** A
 *    subpath is a hole when the fill rule says the area just inside it is
 *    empty. `nonzero` (the SVG default) and `evenodd` disagree, and an author
 *    is free to wind every subpath the same way and rely on `evenodd`. The
 *    heuristic this replaced - "opposite winding AND bounding box inside" -
 *    got both halves wrong.
 *
 *  - **Containment is point-in-polygon, not bounding box.** Two disjoint
 *    shapes can easily have nested bounding boxes; punching one out of the
 *    other deletes real artwork.
 *
 *  - **Orientation is never forced.** `polygon-clipping` returns canonical
 *    winding (outer one way, holes the other), which is correct under both
 *    fill rules, so nothing downstream needs to reverse a ring.
 */

// --- tuning constants for `representativePoints` ---------------------------
// These were all bare literals. Each one is a real trade-off, not a rounding.

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
