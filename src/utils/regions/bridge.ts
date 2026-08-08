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
