import { describe, expect, it } from 'vitest';
import { multiPolygonBounds, polygonsToMultiPolygon, resolveFilledRegions, signedArea } from './pathRegions';

const ring = (x: number, y: number, size: number) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
] as [number, number][];

/** Both wound the same way, one inside the other. */
const OUTER = ring(0, 0, 100);
const INNER = ring(25, 25, 50);

const area = (subpaths: [number, number][][], rule: 'nonzero' | 'evenodd') => {
  const region = polygonsToMultiPolygon(resolveFilledRegions(subpaths, rule));
  return region.reduce(
    (total, poly) => total + poly.reduce((t, r, i) => t + (i === 0 ? 1 : -1) * Math.abs(signedArea(r)), 0),
    0
  );
};

/**
 * The trap this whole module exists for: winding *direction* does not decide
 * what is a hole. The fill rule does. A converter that infers holes from
 * opposite winding fills the second case solid.
 */
describe('resolveFilledRegions', () => {
  it('treats an inner ring of the same winding as a hole under evenodd', () => {
    expect(area([OUTER, INNER], 'evenodd')).toBeCloseTo(100 * 100 - 50 * 50, 0);
  });

  it('treats the same two rings as solid under nonzero', () => {
    expect(area([OUTER, INNER], 'nonzero')).toBeCloseTo(100 * 100, 0);
  });

  it('keeps two disjoint rings as two filled areas', () => {
    expect(area([ring(0, 0, 10), ring(50, 50, 10)], 'evenodd')).toBeCloseTo(200, 0);
  });

  it('returns nothing for a subpath with too few points', () => {
    expect(resolveFilledRegions([[[0, 0], [1, 1]]], 'nonzero')).toEqual([]);
  });
});

describe('signedArea', () => {
  it('changes sign with the winding direction', () => {
    expect(Math.sign(signedArea(OUTER))).toBe(-Math.sign(signedArea([...OUTER].reverse())));
  });
});

describe('multiPolygonBounds', () => {
  it('covers every ring', () => {
    const region = polygonsToMultiPolygon(resolveFilledRegions([ring(10, 20, 30)], 'nonzero'));
    expect(multiPolygonBounds(region)).toMatchObject({ minX: 10, minY: 20, maxX: 40, maxY: 50 });
  });
});
