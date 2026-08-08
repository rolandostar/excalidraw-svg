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
 *
 * The implementation lives in `regions/`, in the order the pipeline runs:
 *
 *   primitives.ts  ring types, tolerances, single-ring predicates
 *   fillRule.ts    which areas are painted, which are holes
 *   boolean.ts     every `polygon-clipping` call, and its failure handling
 *   bridge.ts      outer + holes collapsed into one emittable ring
 *
 * This file stays the import path so the ~seven call sites across the
 * converter do not have to care which of the four they want.
 *
 * Deliberately re-exports only what was public before the split, not
 * everything the four modules export. The rest are exported so the modules can
 * see each other; import `./regions/<module>` directly if you really want one.
 */

export {
  multiPolygonBounds,
  rectRegion,
  signedArea,
  type FillRule,
  type Point,
  type PolygonWithHoles,
  type Ring,
} from './regions/primitives';

export { resolveFilledRegions } from './regions/fillRule';

export {
  differenceMultiPolygons,
  intersectMultiPolygons,
  intersectRingWithRegion,
  normaliseRegion,
  polygonsToMultiPolygon,
  robustUnion,
  type MultiPolygon,
} from './regions/boolean';

export { bridgeHoles, regionToBridgedRings } from './regions/bridge';
