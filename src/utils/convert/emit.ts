import type { ExcalidrawElement } from '../../types/excalidraw';
import type { Point } from '../regions/regions';
import type { RawShape } from './shapes';
import { boundsOf, closeRing } from '../svg/geometry';

/**
 * Turning intermediate shapes into Excalidraw elements.
 *
 *   simplify   Douglas-Peucker on the emitted rings, and the sweep that
 *              chose its tolerance
 *   emit       the element envelopes themselves
 */

// ---------------------------------------------------------------------------
// Ring simplification
// ---------------------------------------------------------------------------

/**
 * Ramer-Douglas-Peucker simplification of an already-closed output ring.
 *
 * Runs after every boolean operation, deliberately. The flattening tolerance
 * upstream of here also feeds `polygon-clipping` - which is documented as
 * fragile on near-collinear input - and gates stroke join wedges, so it is not
 * an output-size knob. This is: it only ever removes points from a finished
 * ring, and cannot change any topology decision that has already been made.
 */

/**
 * How far a simplified ring may deviate from the flattened one, in output
 * pixels at the default 48px icon size.
 *
 * Chosen by sweeping the whole corpus through the fidelity harness:
 *
 * ```
 *   tolerance   points    payload   generation   worst shape error
 *   0 (off)     86,926    1922 KB    ~1230 ms    0.10%
 *   0.02        63,795    1630 KB    ~1215 ms    0.10%
 *   0.05        46,477    1412 KB     ~780 ms    0.13%   <- here
 *   0.10        34,150    1257 KB     ~637 ms    0.15%
 *   0.20        27,020    1167 KB     ~587 ms    0.37%
 * ```
 *
 * 0.05 is where the generation time falls off a cliff while the error is still
 * antialiasing on curved edges rather than anything structural - 0.13% against
 * a 2% gate. Past 0.1 the payload stops improving and the error starts
 * climbing, so there is nothing to buy.
 *
 * Deliberately not exposed as an option. The difference between this and no
 * simplification at all is 0.03 percentage points of shape error, which is
 * invisible in the render; a control for that would be a question with no
 * answer. `iconScale` already varies point density, because the tolerance
 * below is divided by the fit scale.
 */
const OUTPUT_SIMPLIFY_TOLERANCE_PX = 0.05;

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function deviation(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/** RDP over `points[first..last]`, keeping both ends. */
function rdp(points: Point[], first: number, last: number, tolerance: number, keep: boolean[]): void {
  if (last <= first + 1) return;

  let worst = 0;
  let index = -1;
  for (let i = first + 1; i < last; i++) {
    const d = deviation(points[i], points[first], points[last]);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= tolerance || index < 0) return;

  keep[index] = true;
  rdp(points, first, index, tolerance, keep);
  rdp(points, index, last, tolerance, keep);
}

/**
 * Simplifies a closed ring, in the ring's own units.
 *
 * The ring must already be closed (first point repeated as last) and is
 * returned closed. Three invariants the emitter depends on:
 *
 *  - never fewer than 4 distinct-plus-closing points, because Excalidraw's
 *    `isValidPolygon` needs more than three and our `polygon: true` claims it;
 *  - the closing point stays exactly equal to the first, because
 *    `isPathALoop` is what makes Excalidraw fill the shape at all;
 *  - a zero or negative tolerance is a no-op returning the input unchanged,
 *    so the feature being off costs nothing.
 *
 * The seam is split at the vertex furthest from the start rather than at the
 * start itself. RDP fixes its two endpoints, and on a closed ring those are
 * the same point - which makes the first bisection degenerate and biases the
 * result towards whichever vertex the boolean engine happened to emit first.
 */
export function simplifyClosedRing(ring: Point[], tolerance: number): Point[] {
  if (!(tolerance > 0) || ring.length <= 5) return ring;

  // Drop the duplicated closing point; it is restored at the end.
  const open = ring.slice(0, -1);
  const n = open.length;
  if (n < 4) return ring;

  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  }

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[far] = true;
  rdp(open, 0, far, tolerance, keep);

  // Second arc wraps past the end, so it is walked on a rotated copy.
  const tail = [...open.slice(far), open[0]];
  const tailKeep = new Array<boolean>(tail.length).fill(false);
  tailKeep[0] = true;
  tailKeep[tail.length - 1] = true;
  rdp(tail, 0, tail.length - 1, tolerance, tailKeep);
  for (let i = 1; i < tail.length - 1; i++) {
    if (tailKeep[i]) keep[(far + i) % n] = true;
  }

  const out = open.filter((_, i) => keep[i]);
  if (out.length < 4) return ring;

  out.push(out[0]);
  return out;
}

/**
 * The last step: raw user-space geometry becomes Excalidraw elements.
 *
 * Separate from the converters because this is the only place that knows about
 * Excalidraw's schema, its defaults, and the viewBox -> target fit. Everything
 * upstream works in the source file's own coordinates.
 */

export function generateRandomId(): string {
  return Math.random().toString(16).substring(2, 18);
}

function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2000000000);
}

/** Where and how big an element is, in scene units. */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Creates a base Excalidraw element with all required default properties */
export function createBaseElement(
  type: string,
  rect: ElementRect,
  groupId: string,
  overrides: Partial<ExcalidrawElement> = {}
): ExcalidrawElement {
  return {
    id: generateRandomId(),
    type,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [groupId],
    frameId: null,
    index: 'a1',
    roundness: null,
    seed: generateRandomSeed(),
    version: 1,
    versionNonce: generateRandomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  };
}

/** The viewBox -> target mapping, plus the two per-scene style choices. */
export interface EmitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  groupId: string;
  roughness: number;
}

/**
 * `strokeWidth` written onto every converted element.
 *
 * Nothing renders it. Every element this converter emits keeps the
 * `strokeColor: 'transparent'` default, because a source stroke is emitted as
 * the filled *area* it covers instead (see `RawShapeSink.pushStroke`), and
 * `fillStyle` is always `solid` so Rough.js never derives a hatch spacing from
 * it either. Excalidraw still requires the field.
 *
 * The value is what the old `toOutputStrokeWidth` helper computed once its
 * input is traced back to the literal `0` that all six raw-shape push sites
 * wrote: `((0 * fit) || fit)` is just `fit`, rounded to three places and
 * floored. Reproduced exactly - it is *not* a constant across files, it
 * tracks the fit - so the emitted JSON does not change.
 */
function unrenderedStrokeWidth(fit: number): number {
  return Math.max(Number(fit.toFixed(3)), 0.25);
}

export function rawShapesToElements(
  shapes: RawShape[],
  { scale, offsetX, offsetY, groupId, roughness }: EmitTransform
): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];
  const strokeWidth = unrenderedStrokeWidth(scale);

  for (const shape of shapes) {
    if (shape.type === 'ellipse') {
      const elX = Number((offsetX + (shape.cx - shape.rx) * scale).toFixed(2));
      const elY = Number((offsetY + (shape.cy - shape.ry) * scale).toFixed(2));
      const elW = Number((shape.rx * 2 * scale).toFixed(2));
      const elH = Number((shape.ry * 2 * scale).toFixed(2));

      elements.push(
        createBaseElement(
          'ellipse',
          { x: elX, y: elY, width: Math.max(elW, 2), height: Math.max(elH, 2) },
          groupId,
          {
            backgroundColor: shape.fill,
            strokeWidth,
            roughness,
            opacity: shape.opacity,
          }
        )
      );
      continue;
    }

    if (shape.absPoints.length < 2) continue;

    // Excalidraw only fills closed loops, so any ring carrying a fill has to
    // explicitly return to its starting point. These points are in output
    // space, where a micro-unit gap really is closed - hence 1e-6 rather than
    // the 1e-9 the boolean engine uses upstream.
    const wantsFill = !!shape.fill && shape.fill !== 'transparent';
    const closed = wantsFill ? closeRing(shape.absPoints, 1e-6) : shape.absPoints;

    // Simplified before the bounds are taken, so the element box stays tight
    // around the points that actually survive. Tolerance converts from output
    // units into the source's own units, the same way the flattening tolerance
    // does, so the error stays constant in pixels at any `iconScale`.
    const absPoints = wantsFill
      ? simplifyClosedRing(closed, OUTPUT_SIMPLIFY_TOLERANCE_PX / scale)
      : closed;

    const { minX, minY, maxX, maxY } = boundsOf(absPoints);

    const elX = Number((offsetX + minX * scale).toFixed(2));
    const elY = Number((offsetY + minY * scale).toFixed(2));
    const elW = Number(((maxX - minX) * scale).toFixed(2));
    const elH = Number(((maxY - minY) * scale).toFixed(2));

    const relPoints: [number, number][] = absPoints.map(([x, y]) => [
      Number(((x - minX) * scale).toFixed(2)),
      Number(((y - minY) * scale).toFixed(2)),
    ]);

    elements.push(
      createBaseElement(
        'line',
        { x: elX, y: elY, width: Math.max(elW, 1), height: Math.max(elH, 1) },
        groupId,
        {
          backgroundColor: shape.fill,
          strokeWidth,
          roughness,
          opacity: shape.opacity,
          points: relPoints,
          /*
           * Does not affect rendering. Excalidraw decides whether to fill a
           * `line` from `isPathALoop(points)` alone, which a closed ring
           * already satisfies.
           *
           * It is set so the editor treats our output as what it is - a closed
           * polygon. Without it the line editor offers "Convert to polygon",
           * and the bucket-fill tool does not recognise our fills as paint it
           * can restyle in place, so clicking one stacks a second fill on top.
           *
           * Guarded on `> 3` rather than `>= 3` to match Excalidraw's
           * `isValidPolygon`, which is stricter than `isPathALoop`. `restore`
           * silently forces the field back to false when it disagrees, so a
           * claim we cannot back is worse than not making it.
           */
          ...(wantsFill && relPoints.length > 3 ? { polygon: true } : {}),
        }
      )
    );
  }

  return elements;
}
