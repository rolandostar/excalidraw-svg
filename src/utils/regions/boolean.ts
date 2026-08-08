import polygonClipping from 'polygon-clipping';

import { toClosed, type Point, type PolygonWithHoles, type Ring } from './primitives';
import { regionToBridgedRings } from './bridge';

/**
 * Owns every call into `polygon-clipping`, and the two defences that make
 * those calls survivable: coordinate snapping before the sweep, and a
 * graceful fallback after it throws.
 *
 * Separate because that failure handling is the whole content of this file.
 * Every export here is "the boolean operation you wanted, but it degrades
 * instead of losing the artwork", and keeping them together is what stops a
 * caller reaching for the raw library and skipping the snap.
 */

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
 * This is also the union `clipping.ts` wants - a `<clipPath>` with several
 * children, and a `<mask>` accumulating light shapes - which used to reach it
 * through a one-line `unionMultiPolygons` alias.
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
