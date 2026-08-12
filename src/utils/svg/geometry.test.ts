import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  arcSegmentCount,
  boundsOf,
  closeRing,
  matrixScale,
  multiplyMatrix,
  parseTransformMatrix,
  rectangleRing,
} from './geometry';

describe('boundsOf', () => {
  it('covers every point', () => {
    expect(boundsOf([[1, 5], [-3, 2], [4, -1]])).toEqual({ minX: -3, minY: -1, maxX: 4, maxY: 5 });
  });
});

describe('closeRing', () => {
  const open: [number, number][] = [[0, 0], [1, 0], [1, 1]];

  it('repeats the first point', () => {
    expect(closeRing(open, 1e-9)).toHaveLength(4);
    expect(closeRing(open, 1e-9)[3]).toEqual([0, 0]);
  });

  it('leaves an already closed ring alone', () => {
    const closed: [number, number][] = [...open, [0, 0]];
    expect(closeRing(closed, 1e-9)).toHaveLength(4);
  });

  // The three callers use different epsilons on purpose, so the tolerance has
  // to be a real argument rather than a constant.
  it('honours the tolerance it is given', () => {
    const nearlyClosed: [number, number][] = [...open, [1e-7, 0]];
    expect(closeRing(nearlyClosed, 1e-9)).toHaveLength(5);
    expect(closeRing(nearlyClosed, 1e-6)).toHaveLength(4);
  });
});

describe('arcSegmentCount', () => {
  const quarter = Math.PI / 2;

  it('uses more segments for a bigger radius at the same tolerance', () => {
    expect(arcSegmentCount(quarter, 100, 0.1, 2, 64)).toBeGreaterThan(
      arcSegmentCount(quarter, 5, 0.1, 2, 64)
    );
  });

  it('uses more segments for a tighter tolerance', () => {
    expect(arcSegmentCount(quarter, 10, 0.01, 2, 64)).toBeGreaterThan(
      arcSegmentCount(quarter, 10, 1, 2, 64)
    );
  });

  it('uses more segments for a longer sweep', () => {
    expect(arcSegmentCount(2 * Math.PI, 10, 0.1, 2, 64)).toBeGreaterThan(
      arcSegmentCount(quarter, 10, 0.1, 2, 64)
    );
  });

  it('stays inside the clamp it is given', () => {
    expect(arcSegmentCount(2 * Math.PI, 1e6, 1e-6, 2, 64)).toBe(64);
    expect(arcSegmentCount(quarter, 0.0001, 10, 2, 64)).toBe(2);
  });
});

describe('rectangleRing', () => {
  const rect = { x: 0, y: 0, width: 10, height: 6, rx: 0, ry: 0 };

  it('gives a plain rectangle four corners', () => {
    expect(rectangleRing(rect, 0.1)).toHaveLength(4);
  });

  it('rounds the corners when there is a radius', () => {
    expect(rectangleRing({ ...rect, rx: 2, ry: 2 }, 0.1).length).toBeGreaterThan(4);
  });

  it('keeps every point inside the rectangle', () => {
    const bounds = boundsOf(rectangleRing({ ...rect, rx: 2, ry: 2 }, 0.05));
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(10);
    expect(bounds.maxY).toBeCloseTo(6);
  });
});

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const at = (transform: string, point: [number, number]) =>
  applyMatrix(parseTransformMatrix(transform), point).map(n => Math.round(n * 1e6) / 1e6);

describe('parseTransformMatrix', () => {
  it('returns identity for no transform', () => {
    expect(parseTransformMatrix(null)).toEqual(IDENTITY);
  });

  it('translates', () => {
    expect(at('translate(10 5)', [1, 1])).toEqual([11, 6]);
  });

  it('defaults a missing translate y to zero', () => {
    expect(at('translate(10)', [1, 1])).toEqual([11, 1]);
  });

  it('scales, uniformly when given one number', () => {
    expect(at('scale(2)', [3, 4])).toEqual([6, 8]);
    expect(at('scale(2 3)', [3, 4])).toEqual([6, 12]);
  });

  it('rotates a quarter turn anticlockwise in SVG axes', () => {
    expect(at('rotate(90)', [1, 0])).toEqual([0, 1]);
  });

  // Order matters and is easy to get backwards: the rightmost transform is
  // applied to the point first.
  it('applies a transform list right to left', () => {
    expect(at('translate(10 0) scale(2)', [1, 0])).toEqual([12, 0]);
    expect(at('scale(2) translate(10 0)', [1, 0])).toEqual([22, 0]);
  });
});

describe('multiplyMatrix', () => {
  it('leaves a matrix alone when multiplied by identity', () => {
    const m: [number, number, number, number, number, number] = [2, 0, 0, 3, 4, 5];
    expect(multiplyMatrix(IDENTITY, m)).toEqual(m);
    expect(multiplyMatrix(m, IDENTITY)).toEqual(m);
  });
});

describe('matrixScale', () => {
  it('reports the uniform scale factor', () => {
    expect(matrixScale(parseTransformMatrix('scale(3)'))).toBeCloseTo(3);
  });

  it('is unchanged by rotation', () => {
    expect(matrixScale(parseTransformMatrix('rotate(37) scale(2)'))).toBeCloseTo(2);
  });
});
