import polygonClipping from 'polygon-clipping';

/**
 * Turns the flattened subpaths of an SVG path element into the set of filled
 * regions that path actually paints, then flattens each region into the single
 * closed ring an Excalidraw `line` element can represent.
 *
 * The rules this module implements, and why they matter:
 *
 *  - **Hole-ness comes from the fill rule, not from winding direction.**
 *    A subpath is a hole when the fill rule says the area just inside it is
 *    empty. `nonzero` (the SVG default) and `evenodd` disagree, and an author
 *    is free to wind every subpath the same way and rely on `evenodd`. The
 *    previous heuristic - "opposite winding AND bounding box inside" - got
 *    both halves wrong.
 *
 *  - **Containment is point-in-polygon, not bounding box.** Two disjoint
 *    shapes can easily have nested bounding boxes; punching one out of the
 *    other deletes real artwork.
 *
 *  - **Orientation is never forced.** `polygon-clipping` returns canonical
 *    winding (outer one way, holes the other), which is correct under both
 *    fill rules, so nothing here needs to reverse a ring.
 */

export type Point = [number, number];
/** A closed loop, stored without a duplicated final point. */
export type Ring = Point[];

export interface PolygonWithHoles {
  outer: Ring;
  holes: Ring[];
}

export type FillRule = 'nonzero' | 'evenodd';

const EPSILON = 1e-9;

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
  const first = points[0];
  const last = points[points.length - 1];
  const isDuplicate = Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPSILON;
  return isDuplicate ? points.slice(0, -1) : points.slice();
}

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

/** How many longest edges of a ring are considered as sampling sites. */
const CANDIDATE_EDGES = 12;

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
export function representativePoints(rings: Ring[]): Array<Point | null> {
  return rings.map((ring, index) => {
    if (ring.length < 3) return null;

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
        Math.min(edge.length * 0.02, Number.isFinite(clearance) ? clearance * 0.25 : Infinity),
        edge.length * 1e-4
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

function toClosed(ring: Ring): Point[] {
  if (ring.length === 0) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPSILON
    ? ring.slice()
    : [...ring, [first[0], first[1]] as Point];
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
  const rings = subpaths.map(normaliseRing).filter(ring => ring.length >= 3);
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
      if (!outer || outer.length < 4) continue;
      resolved.push({
        outer: normaliseRing(outer as Point[]),
        holes: holes.map(h => normaliseRing(h as Point[])).filter(h => h.length >= 3),
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

/**
 * A set of disjoint regions, each `[outerRing, ...holeRings]`.
 * Matches `polygon-clipping`'s MultiPolygon layout.
 */
export type MultiPolygon = Point[][][];

export function polygonsToMultiPolygon(polygons: PolygonWithHoles[]): MultiPolygon {
  return polygons.map(p => [toClosed(p.outer), ...p.holes.map(toClosed)]);
}

/**
 * Grid that coordinates are snapped to before a boolean operation.
 *
 * `polygon-clipping`'s sweep line fails with "Unable to find segment #N in
 * SweepLine tree" when it meets vertices that are *almost* but not exactly
 * coincident or collinear - which is precisely what flattened curves and
 * offset outlines produce. Snapping to ~1e-7 of a user unit (a ten-millionth
 * of a pixel at these sizes) collapses those near-duplicates into exact ones.
 */
const SNAP = 1e7;

export function snapPoint(p: Point): Point {
  return [Math.round(p[0] * SNAP) / SNAP, Math.round(p[1] * SNAP) / SNAP];
}

export function snapMultiPolygon(region: MultiPolygon): MultiPolygon {
  return region.map(polygon => polygon.map(ring => ring.map(snapPoint)));
}

/**
 * Union that degrades gracefully instead of throwing.
 *
 * A single variadic union is one big sweep, so one numerically awkward vertex
 * loses the whole result. Splitting into a balanced merge means each sweep is
 * smaller and far more likely to succeed, and a failure at one node costs only
 * that subtree's simplification - the geometry is still all there, just as
 * separate polygons.
 */
export function robustUnion(regions: MultiPolygon[]): MultiPolygon {
  const usable = regions.filter(r => r.length > 0).map(snapMultiPolygon);
  if (usable.length === 0) return [];
  if (usable.length === 1) return usable[0];

  try {
    return polygonClipping.union(usable[0] as any, ...(usable.slice(1) as any)) as MultiPolygon;
  } catch {
    if (usable.length === 2) return [...usable[0], ...usable[1]];
    const middle = Math.floor(usable.length / 2);
    return robustUnion([robustUnion(usable.slice(0, middle)), robustUnion(usable.slice(middle))]);
  }
}

/**
 * Resolves a region against itself, turning self-intersections into proper
 * outer/hole structure.
 *
 * Offsetting a polyline is clean on smooth curves but crosses itself on the
 * inside of any sharp turn, and a self-crossing ring rasterises with the
 * crossed lobe punched out. Normalising costs one small boolean per stroke.
 */
export function normaliseRegion(region: MultiPolygon): MultiPolygon {
  if (region.length === 0) return [];
  try {
    return polygonClipping.union(snapMultiPolygon(region) as any) as MultiPolygon;
  } catch {
    return region;
  }
}

/** Union of several regions - the semantics of a `<clipPath>` with multiple children. */
export function unionMultiPolygons(regions: MultiPolygon[]): MultiPolygon {
  return robustUnion(regions);
}

/** `a` minus `b`. Used by masks, where a dark shape subtracts from the visible area. */
export function differenceMultiPolygons(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return a;
  try {
    return polygonClipping.difference(snapMultiPolygon(a) as any, snapMultiPolygon(b) as any) as MultiPolygon;
  } catch {
    return a;
  }
}

/** Intersection of several regions - the semantics of *nested* clip paths. */
export function intersectMultiPolygons(regions: MultiPolygon[]): MultiPolygon {
  if (regions.length === 0) return [];
  if (regions.length === 1) return regions[0];
  const snapped = regions.map(snapMultiPolygon);
  try {
    return polygonClipping.intersection(snapped[0] as any, ...(snapped.slice(1) as any)) as MultiPolygon;
  } catch {
    // Better to under-clip than to lose the artwork entirely.
    return snapped[0];
  }
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

export function multiPolygonBounds(region: MultiPolygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of region) {
    for (const [x, y] of polygon[0] ?? []) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Flattens a boolean result into bridged rings, discarding holes too small to
 * be visible.
 *
 * This filter is not cosmetic. Offsetting a flattened curve makes consecutive
 * segment quads cross on the inside of every turn, and the union faithfully
 * reports each crossing as a hole - a 2.5-unit circle stroke came back with 40
 * of them, each about 5e-8 square units. Bridging a hole costs a zero-width
 * corridor from the outer ring, and forty corridors radiating across a stroke
 * rasterise as forty visible hairlines. Geometrically the holes are nothing;
 * the corridors were the entire defect.
 */
export function regionToBridgedRings(region: MultiPolygon, minHoleArea = 0): Ring[] {
  const out: Ring[] = [];

  for (const polygon of region) {
    const outer = normaliseRing(polygon[0] as Point[]);
    if (outer.length < 3) continue;
    if (minHoleArea > 0 && Math.abs(signedArea(outer)) <= minHoleArea) continue;

    const holes = polygon
      .slice(1)
      .map(h => normaliseRing(h as Point[]))
      .filter(h => h.length >= 3 && Math.abs(signedArea(h)) > minHoleArea);

    out.push(bridgeHoles({ outer, holes }));
  }

  return out;
}

/**
 * Clips one filled ring against a region, returning rings already flattened
 * through `bridgeHoles` so each result is usable as a single Excalidraw `line`.
 */
export function intersectRingWithRegion(ring: Ring, region: MultiPolygon, minHoleArea = 0): Ring[] {
  if (ring.length < 3 || region.length === 0) return [];
  const result = polygonClipping.intersection([[toClosed(ring)]] as any, region as any) as MultiPolygon;
  return regionToBridgedRings(result, minHoleArea);
}

function nearestVertexPair(outer: Ring, hole: Ring): { outerIndex: number; holeIndex: number } {
  let outerIndex = 0;
  let holeIndex = 0;
  let best = Infinity;

  for (let i = 0; i < outer.length; i++) {
    for (let j = 0; j < hole.length; j++) {
      const dx = outer[i][0] - hole[j][0];
      const dy = outer[i][1] - hole[j][1];
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        outerIndex = i;
        holeIndex = j;
      }
    }
  }

  return { outerIndex, holeIndex };
}

/**
 * Collapses an outer ring plus holes into one self-touching ring, joined by
 * zero-width corridors. Excalidraw's `line` element has a single point list,
 * so this is the only way to express a hole; Rough.js fills `polygon` shapes
 * with `fill-rule: evenodd`, which is what makes the corridors invisible.
 *
 * Every corridor anchors on a vertex of the **original** outer ring. The old
 * implementation stitched holes into an accumulating ring, so the second hole
 * could attach to the first hole's boundary and drive its corridor straight
 * through the first hole's interior.
 */
export function bridgeHoles(polygon: PolygonWithHoles): Ring {
  const { outer, holes } = polygon;
  if (holes.length === 0 || outer.length < 3) return outer;

  const attachments = new Map<number, Array<{ hole: Ring; holeIndex: number }>>();

  for (const hole of holes) {
    if (hole.length < 3) continue;
    const { outerIndex, holeIndex } = nearestVertexPair(outer, hole);
    const bucket = attachments.get(outerIndex);
    if (bucket) bucket.push({ hole, holeIndex });
    else attachments.set(outerIndex, [{ hole, holeIndex }]);
  }

  const result: Ring = [];
  for (let i = 0; i < outer.length; i++) {
    result.push(outer[i]);
    const bucket = attachments.get(i);
    if (!bucket) continue;
    for (const { hole, holeIndex } of bucket) {
      for (let k = 0; k < hole.length; k++) {
        result.push(hole[(holeIndex + k) % hole.length]);
      }
      result.push(hole[holeIndex]);
      result.push(outer[i]);
    }
  }

  return result;
}
