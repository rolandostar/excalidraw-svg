import { describe, expect, it } from 'vitest';
import { simplifyClosedRing } from './emit';
import type { Point } from '../regions/regions';

/** A closed ring: first point repeated as last, as the emitter produces. */
const closed = (pts: Point[]): Point[] => [...pts, pts[0]];

/** A square with `n` evenly spaced redundant points along its top edge. */
const squareWithPaddedTop = (n: number): Point[] => {
  const top: Point[] = Array.from({ length: n }, (_, i) => [((i + 1) * 100) / (n + 1), 0]);
  return closed([[0, 0], ...top, [100, 0], [100, 100], [0, 100]]);
};

const isClosed = (r: Point[]) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

describe('simplifyClosedRing', () => {
  it('drops points that sit on a straight edge', () => {
    const result = simplifyClosedRing(squareWithPaddedTop(20), 0.01);
    expect(result.length).toBeLessThan(8);
    expect(isClosed(result)).toBe(true);
  });

  it('keeps a point that deviates by more than the tolerance', () => {
    const spike = closed([[0, 0], [50, 5], [100, 0], [100, 100], [0, 100]]);
    expect(simplifyClosedRing(spike, 1)).toHaveLength(spike.length);
  });

  it('is a no-op at zero tolerance, so the feature off costs nothing', () => {
    const ring = squareWithPaddedTop(20);
    expect(simplifyClosedRing(ring, 0)).toBe(ring);
  });

  it('leaves small rings alone', () => {
    const triangle = closed([[0, 0], [10, 0], [5, 10]]);
    expect(simplifyClosedRing(triangle, 100)).toBe(triangle);
  });

  // Both are load-bearing downstream: Excalidraw only fills a `line` when
  // isPathALoop holds, and our `polygon: true` claims isValidPolygon, which
  // needs more than three points.
  it('never returns fewer than 4 points, however coarse the tolerance', () => {
    const result = simplifyClosedRing(squareWithPaddedTop(40), 1e6);
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(isClosed(result)).toBe(true);
  });

  it('keeps every surviving point in its original order', () => {
    const ring = squareWithPaddedTop(12);
    const result = simplifyClosedRing(ring, 0.01);
    const positions = result.slice(0, -1).map(p => ring.findIndex(q => q[0] === p[0] && q[1] === p[1]));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
