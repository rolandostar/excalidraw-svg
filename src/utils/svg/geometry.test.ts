import { describe, expect, it } from 'vitest';
import { arcSegmentCount, boundsOf, closeRing, rectangleRing } from './geometry';

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
