import polygonClipping from 'polygon-clipping';
import {
  MultiPolygon,
  normaliseRing,
  signedArea,
  toClosed,
  type Point,
  type PolygonWithHoles,
  type Ring,
} from './regions';

/**
 * Every `polygon-clipping` call, its failure handling, and the collapse of an
 * outer ring plus holes into the single closed ring an Excalidraw `line` can
 * represent.
 *
 *   booleans   union, difference, intersection, and the snapping they need
 *   bridging   outer + holes -> one emittable ring
 */

// ---------------------------------------------------------------------------
// Boolean operations
// ---------------------------------------------------------------------------

/**
 * Owns every call into `polygon-clipping`, and the two defences that make
 * those calls survivable: coordinate snapping before the sweep, and a
 * graceful fallback after it throws.
 */

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

function snapPoint(p: Point): Point {
  return [Math.round(p[0] * SNAP) / SNAP, Math.round(p[1] * SNAP) / SNAP];
}

function snapMultiPolygon(region: MultiPolygon): MultiPolygon {
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
 *
 * Also the union `clipping.ts` wants, for a `<clipPath>` with several children
 * and for a `<mask>` accumulating light shapes.
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

/**
 * Clips one filled ring against a region, returning rings already flattened
 * through `bridgeHoles` so each result is usable as a single Excalidraw `line`.
 */
export function intersectRingWithRegion(ring: Ring, region: MultiPolygon, minHoleArea = 0): Ring[] {
  if (ring.length < 3 || region.length === 0) return [];
  const result = polygonClipping.intersection([[toClosed(ring)]] as any, region as any) as MultiPolygon;
  return regionToBridgedRings(result, minHoleArea);
}

/**
 * Owns the last step before emission: collapsing outer-plus-holes structure
 * into the single point list an Excalidraw `line` element can hold.
 */

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
 * Reverses a hole that winds the same way as its outer ring.
 *
 * Under `evenodd` the direction does not matter - a corridor traversed twice
 * cancels either way. Under `nonzero` it decides everything: a hole wound with
 * its outer contributes +1 instead of 0 and fills solid.
 *
 * Excalidraw uses `evenodd` today, at every layer we checked, so this changes
 * nothing we render. It is here so that the rule is a property of the geometry
 * rather than an assumption about the renderer, which is also what Excalidraw's
 * own `spliceHoleIntoRing` does for the same stated reason.
 */
function orientedAsHole(hole: Ring, outer: Ring): Ring {
  return Math.sign(signedArea(hole)) === Math.sign(signedArea(outer))
    ? [...hole].reverse()
    : hole;
}

/**
 * Collapses an outer ring plus holes into one self-touching ring, joined by
 * zero-width corridors. Excalidraw's `line` element has a single point list,
 * so this is the only way to express a hole.
 *
 * The result is correct under both fill rules: the corridors cancel under
 * `evenodd`, and each hole is wound against its outer so the winding numbers
 * also cancel under `nonzero`. Excalidraw's renderer, its SVG export and
 * Rough.js all use `evenodd` for polygon fills, so that is the path actually
 * taken - the winding is insurance for anything else that reads the output.
 *
 * Every corridor anchors on a vertex of the **original** outer ring, never on
 * an accumulating one: a corridor anchored on a previous hole's boundary runs
 * straight through that hole's interior.
 */
export function bridgeHoles(polygon: PolygonWithHoles): Ring {
  const { outer, holes } = polygon;
  if (holes.length === 0 || outer.length < 3) return outer;

  const attachments = new Map<number, Array<{ hole: Ring; holeIndex: number }>>();

  for (const raw of holes) {
    if (raw.length < 3) continue;
    // Orient first: `nearestVertexPair` returns an index into the ring that
    // gets spliced, and reversing afterwards would point it at the wrong
    // vertex.
    const hole = orientedAsHole(raw, outer);
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
