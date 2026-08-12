/**
 * Curve flattening: turning a `d` attribute into polylines, and choosing how
 * finely to do it.
 *
 * Separate from the geometry module because it owns the one third-party
 * dependency in the conversion pipeline (`points-on-path`) and the interop
 * shim that dependency needs. Everything downstream sees plain point arrays.
 */
import * as pointsOnPathModule from 'points-on-path';

/**
 * `points-on-path` ships CJS, ESM and bundler entry points that disagree about
 * where the function lives, so it is resolved defensively rather than imported
 * by name.
 */
export function getPointsOnPath(path: string, tolerance?: number): [number, number][][] {
  const mod = pointsOnPathModule as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const fn =
    (mod.pointsOnPath as unknown) ||
    (mod.default?.pointsOnPath as unknown) ||
    (mod.default as unknown) ||
    (mod as unknown);
  if (typeof fn === 'function') {
    return (fn as (p: string, t?: number) => [number, number][][])(path, tolerance);
  }
  return [];
}

/**
 * Target curve-flattening error at the default 48px icon size, in user units
 * of a nominal 1x fit. Divided by the actual viewBox->target scale so the
 * error stays constant in output pixels as `iconScale` grows.
 *
 * Empirically 0.002 puts a 9-unit circle at ~0.003 user units of sagitta -
 * under a hundredth of a pixel at 48px - for ~130 points.
 */
const CURVE_TOLERANCE_USER_UNITS_AT_1X = 0.002;

/**
 * Curve flattening tolerance, in *user units*, derived from the output size so
 * that the error is constant in pixels no matter what `iconScale` the caller
 * asked for. The old value was a hard-coded 0.05 plus a Ramer-Douglas-Peucker
 * pass at 0.2 user units - 0.8% of a 24-unit artboard - which visibly
 * polygonised every circle and got 2x worse each time the icon was scaled up.
 */
export function toleranceFor(scale: number): number {
  return Math.min(Math.max(CURVE_TOLERANCE_USER_UNITS_AT_1X / scale, 1e-5), 0.05);
}
