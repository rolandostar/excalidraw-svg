/**
 * The `objectBoundingBox` unit system.
 *
 * `clipPath`, `mask` and `filter` can all express their coordinates either in
 * user units or as fractions of the referencing element's geometry box, and
 * they do not agree on which is the default. That one idea - measure a box,
 * then read lengths as fractions of it - is what this module owns, and it is
 * separate from `clipping.ts` so that the clip and mask logic can be read
 * without it and so that `matrix.ts` can depend on `BoundingBox` alone.
 */
import { Point, rectRegion } from '../regions/primitives';
import type { MultiPolygon } from '../regions/boolean';
import { applyMatrix, getCombinedTransformMatrixUntil } from './matrix';
import { boundsOfRings, shapeBoundsPoints } from './geometry';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Geometry bounding box of `node` in its own user space.
 *
 * This is what `objectBoundingBox` units are fractions of. Per spec it covers
 * geometry only - stroke, markers and clipping are excluded - and it is
 * expressed in the coordinate system `node` establishes for its children,
 * which is exactly the space `referenceMatrix` already maps from. Hence each
 * descendant is transformed only as far up as `node`, never including `node`'s
 * own transform.
 *
 * Returns null when there is no geometry, or when the box is degenerate in
 * either axis: the unit matrix would be singular, and the spec says such a
 * reference simply does not apply.
 */
export function localBoundingBox(node: Element, tolerance: number): BoundingBox | null {
  const rings: Point[][] = [];

  const consider = (shape: Element) => {
    // Skip non-rendered containers *inside* `node`, but not ones `node` itself
    // lives in - a mask child legitimately has a bounding box of its own, and
    // an unconditional `closest()` test made every such box come back empty.
    const container = shape.closest('defs, clipPath, mask');
    if (container && container !== node && node.contains(container)) return;

    const matrix = getCombinedTransformMatrixUntil(shape, node);
    for (const ring of shapeBoundsPoints(shape, tolerance)) {
      rings.push(ring.map(pt => applyMatrix(matrix, pt)));
    }
  };

  // `shapeBoundsPoints`, not `shapeToRings`: a `<line>` belongs in a bounding
  // box even though it encloses no area, and this selector has always
  // included it.
  const selector = 'path, polygon, polyline, line, rect, circle, ellipse';
  if (node.matches?.(selector)) consider(node);
  node.querySelectorAll(selector).forEach(consider);

  const { minX, minY, maxX, maxY } = boundsOfRings(rings);
  if (minX === Infinity) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;

  return { x: minX, y: minY, width, height };
}

/**
 * Parses a length that may be a fraction or a percentage.
 * In `objectBoundingBox` units `-10%` and `-0.1` mean the same thing.
 */
export function parseFraction(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const text = value.trim();
  const parsed = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The attributes that select a unit system for a referenced region. */
export type UnitsAttr = 'filterUnits' | 'maskUnits' | 'clipPathUnits';

/**
 * The x/y/width/height region of a `<filter>` or `<mask>`, in user space.
 *
 * Both attributes default to `objectBoundingBox`, not `userSpaceOnUse`, with a
 * default region of -10%/-10%/120%/120%. Requiring an explicit
 * `userSpaceOnUse` - as this used to - silently skipped the region for every
 * file that relied on the default. For a mask that is harmless, because the
 * default region is larger than the object; for the flood rect of a luminosity
 * mask it collapsed the mask to nothing and deleted the artwork.
 */
export function explicitRegionRect(
  el: Element,
  unitsAttr: UnitsAttr,
  box: BoundingBox | null
): MultiPolygon | null {
  const units = el.getAttribute(unitsAttr) || 'objectBoundingBox';

  if (units === 'userSpaceOnUse') {
    const x = parseFloat(el.getAttribute('x') || '');
    const y = parseFloat(el.getAttribute('y') || '');
    const width = parseFloat(el.getAttribute('width') || '');
    const height = parseFloat(el.getAttribute('height') || '');
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return rectRegion(x, y, width, height);
  }

  if (!box) return null;

  const fx = parseFraction(el.getAttribute('x'), -0.1);
  const fy = parseFraction(el.getAttribute('y'), -0.1);
  const fw = parseFraction(el.getAttribute('width'), 1.2);
  const fh = parseFraction(el.getAttribute('height'), 1.2);
  if (!(fw > 0) || !(fh > 0)) return null;

  return rectRegion(
    box.x + fx * box.width,
    box.y + fy * box.height,
    fw * box.width,
    fh * box.height
  );
}
