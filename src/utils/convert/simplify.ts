/**
 * Ramer-Douglas-Peucker simplification of an already-closed output ring.
 *
 * Runs after every boolean operation, deliberately. The flattening tolerance
 * upstream of here also feeds `polygon-clipping` - which is documented as
 * fragile on near-collinear input - and gates stroke join wedges, so it is not
 * an output-size knob. This is: it only ever removes points from a finished
 * ring, and cannot change any topology decision that has already been made.
 */
import type { Point } from '../regions/primitives';

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
export const OUTPUT_SIMPLIFY_TOLERANCE_PX = 0.05;

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
