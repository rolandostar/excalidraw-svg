import { describe, expect, it } from 'vitest';
import {
  multiPolygonBounds,
  resolveFilledRegions,
  signedArea,
  type Point,
  type Ring,
} from './regions';
import { bridgeHoles, polygonsToMultiPolygon } from './booleans';

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

const square = (x: number, y: number, size: number): Ring => ring(x, y, size);

const reversed = (ring: Ring): Ring => [...ring].reverse();

/** Winding of the hole as it appears in the bridged result. */
const holeWindingIn = (result: Ring, hole: Ring): number => {
  const first = result.findIndex(p => p[0] === hole[0][0] && p[1] === hole[0][1]);
  const slice = result.slice(first, first + hole.length) as Point[];
  return Math.sign(signedArea(slice));
};

/**
 * The corridor cancels under even-odd whichever way the hole is wound, so
 * this only shows up if something reads the output with the nonzero rule.
 * Excalidraw does not, but the output is a public file format.
 */
describe('bridgeHoles', () => {
  it('reverses a hole wound the same way as its outer ring', () => {
    const hole = square(25, 25, 50);
    expect(Math.sign(signedArea(hole))).toBe(Math.sign(signedArea(OUTER)));

    const result = bridgeHoles({ outer: OUTER, holes: [hole] });
    expect(holeWindingIn(result, reversed(hole))).toBe(-Math.sign(signedArea(OUTER)));
  });

  it('leaves a hole that already winds against its outer alone', () => {
    const hole = reversed(square(25, 25, 50));
    const result = bridgeHoles({ outer: OUTER, holes: [hole] });
    expect(holeWindingIn(result, hole)).toBe(-Math.sign(signedArea(OUTER)));
  });

  it('nets out to outer minus hole under the nonzero rule', () => {
    const result = bridgeHoles({ outer: OUTER, holes: [square(25, 25, 50)] });
    expect(Math.abs(signedArea(result))).toBeCloseTo(100 * 100 - 50 * 50, 6);
  });

  it('returns the outer ring untouched when there are no holes', () => {
    expect(bridgeHoles({ outer: OUTER, holes: [] })).toBe(OUTER);
  });

  // Regression: an earlier version stitched into an accumulating ring, so the
  // second hole could anchor on the first hole's boundary and drive its
  // corridor through the first hole's interior.
  it('anchors every corridor on the original outer ring', () => {
    const holes = [square(10, 10, 20), square(60, 60, 20)];
    const result = bridgeHoles({ outer: OUTER, holes });
    for (const corner of OUTER) {
      expect(result.some(p => p[0] === corner[0] && p[1] === corner[1])).toBe(true);
    }
  });
});
