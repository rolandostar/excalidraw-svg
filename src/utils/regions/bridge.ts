import { normaliseRing, signedArea, type Point, type PolygonWithHoles, type Ring } from './primitives';
import type { MultiPolygon } from './boolean';

/**
 * Owns the last step before emission: collapsing outer-plus-holes structure
 * into the single point list an Excalidraw `line` element can hold.
 *
 * Separate because it is the one place that knowingly produces degenerate
 * geometry - self-touching rings with zero-width corridors - and because both
 * of the comments below record defects that were caused by getting the detail
 * of that collapse wrong.
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
 * Every corridor anchors on a vertex of the **original** outer ring. The old
 * implementation stitched holes into an accumulating ring, so the second hole
 * could attach to the first hole's boundary and drive its corridor straight
 * through the first hole's interior.
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
