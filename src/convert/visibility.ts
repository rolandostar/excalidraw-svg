import {
  MultiPolygon,
  Point,
  multiPolygonBounds,
  rectRegion,
  resolveFilledRegions,
} from './regions';
import {
  differenceMultiPolygons,
  intersectMultiPolygons,
  intersectRingWithRegion,
  polygonsToMultiPolygon,
  robustUnion,
} from './booleans';
import {
  AREA_SHAPES,
  BoundingBox,
  DRAWABLE_SHAPES,
  Matrix2D,
  applyMatrix,
  boundingBoxMatrix,
  boundsOf,
  boundsOfRings,
  getCombinedTransformMatrixUntil,
  multiplyMatrix,
  shapeBoundsPoints,
  shapeToRings,
} from './geometry';
import { FILL_RULES, getInheritedFillRule, inheritedEnum, paintLuminance, refId } from './style';

/**
 * Everything that limits *where* a shape may paint: `clip-path`, `mask`, the
 * `objectBoundingBox` unit system both are expressed in, and the final
 * ring-against-region intersection.
 *
 * One module because clips and masks are mutually recursive in practice - a
 * mask child can carry a filter whose region is a bounding box of its own -
 * and because the whole group is consumed through one entry point,
 * `getVisibilityRegion`.
 */

// ---------------------------------------------------------------------------
// objectBoundingBox units
// ---------------------------------------------------------------------------

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

  // `DRAWABLE_SHAPES` and `shapeBoundsPoints`, not the area pair: a `<line>`
  // belongs in a bounding box even though it encloses no area.
  if (node.matches?.(DRAWABLE_SHAPES)) consider(node);
  node.querySelectorAll(DRAWABLE_SHAPES).forEach(consider);

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
function parseFraction(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const text = value.trim();
  const parsed = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The attributes that select a unit system for a referenced region. */
type UnitsAttr = 'filterUnits' | 'maskUnits' | 'clipPathUnits';

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
function explicitRegionRect(
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

/**
 * Everything that limits *where* a shape may paint: `clip-path`, `mask`, and
 * the final ring-against-region intersection.
 *
 * One module because clips and masks are mutually recursive in practice - a
 * mask child can carry a filter whose region is a bounding box of its own -
 * and because the whole group is consumed through a single entry point,
 * `getVisibilityRegion`. The unit system both of them can be expressed in
 * lives next door, in `objectBounds.ts`.
 */

// ---------------------------------------------------------------------------
// Clips and masks
// ---------------------------------------------------------------------------

/** The region a single `<clipPath>` defines, in the referencing element's space. */
function resolveClipPathRegion(
  clipEl: Element,
  referenceMatrix: Matrix2D,
  tolerance: number,
  box: BoundingBox | null
): MultiPolygon {
  // `clipPathUnits` defaults to userSpaceOnUse; under objectBoundingBox the
  // child coordinates are fractions of the referencing element's box.
  const unitMatrix =
    (clipEl.getAttribute('clipPathUnits') || 'userSpaceOnUse') === 'objectBoundingBox' && box
      ? multiplyMatrix(referenceMatrix, boundingBoxMatrix(box))
      : referenceMatrix;

  const regions: MultiPolygon[] = [];

  clipEl.querySelectorAll(AREA_SHAPES).forEach(shape => {
    const matrix = multiplyMatrix(unitMatrix, getCombinedTransformMatrixUntil(shape, clipEl));
    const rings = shapeToRings(shape, tolerance);
    if (rings.length === 0) return;

    const transformed = rings.map(ring => ring.map(pt => applyMatrix(matrix, pt)));
    const rule = inheritedEnum(shape, 'clip-rule', FILL_RULES, 'nonzero');
    const polygons = resolveFilledRegions(transformed, rule);
    if (polygons.length > 0) regions.push(polygonsToMultiPolygon(polygons));
  });

  // Multiple children of one clipPath union together.
  return robustUnion(regions);
}

/**
 * The visible region a `<mask>` defines, in the referencing element's space.
 *
 * A real mask multiplies alpha by luminance per pixel, which cannot be
 * expressed as vector geometry. Every mask design tools emit is effectively
 * binary, so it is modelled as one: mask children are painted in document
 * order, a light shape adding to the visible region and a dark shape
 * subtracting from it.
 *
 * The one idiom that needs special handling is Illustrator's "luminosity
 * mask": a child carrying a `<filter>` whose first primitive is
 * `feFlood flood-color="#fff"`. That floods the filter region white *behind*
 * the shape, so a plain black circle becomes "reveal everything except this
 * circle" rather than "reveal nothing". Without it, `PubSub.svg` masks its
 * three connector bars away entirely.
 */
function resolveMaskRegion(
  maskEl: Element,
  referenceMatrix: Matrix2D,
  tolerance: number,
  doc: Document,
  box: BoundingBox | null
): MultiPolygon {
  let visible: MultiPolygon = [];

  // `maskContentUnits` defaults to userSpaceOnUse. Under objectBoundingBox the
  // children are fractions of the box, so `<rect width="1" height="1"/>` means
  // "cover the whole object" - read as user units it is a 1x1 sliver that
  // erases almost everything.
  const contentMatrix =
    (maskEl.getAttribute('maskContentUnits') || 'userSpaceOnUse') === 'objectBoundingBox' && box
      ? multiplyMatrix(referenceMatrix, boundingBoxMatrix(box))
      : referenceMatrix;

  const transformRegion = (region: MultiPolygon): MultiPolygon =>
    region.map(polygon => polygon.map(ring => ring.map(pt => applyMatrix(referenceMatrix, pt))));

  maskEl.querySelectorAll(AREA_SHAPES).forEach(shape => {
    const matrix = multiplyMatrix(contentMatrix, getCombinedTransformMatrixUntil(shape, maskEl));

    const filterRef = refId(shape.getAttribute('filter'));
    if (filterRef) {
      const filterEl = doc.querySelector(`filter[id="${filterRef}"]`);
      const flood = filterEl?.querySelector('feFlood');
      if (filterEl && flood && paintLuminance(flood.getAttribute('flood-color')) >= 0.5) {
        // A filter region is relative to the element the *filter* is applied
        // to - this shape - not to the element referencing the mask, and it
        // lives in that shape's own user space. Using the mask's box and
        // matrix happened to work only because PubSub's filter is
        // userSpaceOnUse on an untransformed child.
        const floodRect = explicitRegionRect(filterEl, 'filterUnits', localBoundingBox(shape, tolerance));
        if (floodRect) {
          const placed = floodRect.map(polygon =>
            polygon.map(ring => ring.map(pt => applyMatrix(matrix, pt)))
          );
          visible = robustUnion([visible, placed]);
        }
      }
    }

    const rings = shapeToRings(shape, tolerance);
    if (rings.length === 0) return;

    const transformed = rings.map(ring => ring.map(pt => applyMatrix(matrix, pt)));
    const polygons = resolveFilledRegions(transformed, getInheritedFillRule(shape));
    if (polygons.length === 0) return;

    const region = polygonsToMultiPolygon(polygons);
    const luminance = paintLuminance(shape.getAttribute('fill'));

    visible =
      luminance >= 0.5
        ? robustUnion([visible, region])
        : differenceMultiPolygons(visible, region);
  });

  // Content outside the mask's own region is not rendered at all.
  const maskRect = explicitRegionRect(maskEl, 'maskUnits', box);
  if (maskRect) visible = intersectMultiPolygons([visible, transformRegion(maskRect)]);

  return visible;
}

/**
 * Everything that limits where `el` may paint, together with whether we were
 * able to model all of it.
 *
 * `region: null` means unrestricted. `confident: false` means at least one
 * construct in the chain could not be resolved, which changes how an empty
 * result must be treated - see `resolveVisibility`.
 */
export interface Visibility {
  region: MultiPolygon | null;
  confident: boolean;
}

/**
 * Collects every `clip-path` and `mask` applying to `el`, at any depth,
 * intersected into one region in root user space.
 *
 * Nesting **intersects**: a shape inside `<g clip-path="A"><g mask="B">` is
 * visible only where A and B overlap. Walking to the nearest ancestor and
 * stopping - the first version of this - silently ignored the outer one, which
 * is how `Iot-Edge.svg` ended up as a large blue rectangle.
 *
 * Per spec both apply *after* the referencing element's own transform, hence
 * `referenceMatrix x localMatrix`, and `objectBoundingBox` units are fractions
 * of the referencing element's geometry box.
 */
export function getVisibilityRegion(el: Element, doc: Document, tolerance: number): Visibility {
  const regions: MultiPolygon[] = [];
  let confident = true;
  let node: Element | null = el;

  while (node && node.tagName.toLowerCase() !== 'svg') {
    const clipRef = refId(node.getAttribute('clip-path'));
    const maskRef = refId(node.getAttribute('mask'));

    if (clipRef || maskRef) {
      const referenceMatrix = getCombinedTransformMatrixUntil(node);
      const reference = node;

      // Only paid for when something actually references the box.
      let box: BoundingBox | null | undefined;
      const boxFor = () => (box === undefined ? (box = localBoundingBox(reference, tolerance)) : box);

      if (clipRef) {
        const clipEl = doc.querySelector(`clipPath[id="${clipRef}"]`);
        if (!clipEl) {
          confident = false;
        } else {
          const needsBox = (clipEl.getAttribute('clipPathUnits') || '') === 'objectBoundingBox';
          if (needsBox && !boxFor()) confident = false;
          else regions.push(resolveClipPathRegion(clipEl, referenceMatrix, tolerance, boxFor()));
        }
      }

      if (maskRef) {
        const maskEl = doc.querySelector(`mask[id="${maskRef}"]`);
        if (!maskEl) {
          confident = false;
        } else {
          regions.push(resolveMaskRegion(maskEl, referenceMatrix, tolerance, doc, boxFor()));
        }
      }
    }

    node = node.parentElement;
  }

  if (regions.length === 0) return { region: null, confident };
  if (regions.some(r => r.length === 0)) return { region: [], confident };
  return { region: intersectMultiPolygons(regions), confident };
}

/**
 * Turns a `Visibility` into the region to actually clip against.
 *
 * An empty region means "paints nothing". That is correct only when we
 * understood every construct involved; when we did not, dropping the shape
 * would delete artwork on the strength of a guess. Over-drawing is recoverable
 * and visible, silent deletion is neither - so an unconfident empty result
 * falls back to unrestricted.
 */
export function resolveVisibility(visibility: Visibility): MultiPolygon | null {
  if (visibility.region && visibility.region.length === 0 && !visibility.confident) return null;
  return visibility.region;
}

/**
 * Intersects a filled ring with the clip region.
 *
 * Short-circuits when the clip cannot possibly crop the ring, which is the
 * overwhelmingly common case: design tools emit a full-artboard clip on almost
 * every export, and a boolean op there would cost precision and time for no
 * benefit.
 */
export function applyClip(
  ring: Point[],
  clipRegion: MultiPolygon | null,
  minHoleArea = 0
): Point[][] {
  if (!clipRegion || ring.length < 3) return [ring];
  if (clipRegion.length === 0) return [];

  const { minX, minY, maxX, maxY } = boundsOf(ring);

  const clip = multiPolygonBounds(clipRegion);
  const contained =
    minX >= clip.minX - 1e-6 &&
    minY >= clip.minY - 1e-6 &&
    maxX <= clip.maxX + 1e-6 &&
    maxY <= clip.maxY + 1e-6;

  // A containing *bounding box* only proves the clip is a no-op when the clip
  // is a single hole-free rectangle; otherwise the boolean still has to run.
  const clipIsSimpleBox =
    clipRegion.length === 1 && clipRegion[0].length === 1 && clipRegion[0][0].length <= 5;
  if (contained && clipIsSimpleBox) return [ring];

  try {
    return intersectRingWithRegion(ring, clipRegion, minHoleArea);
  } catch {
    return [ring];
  }
}
