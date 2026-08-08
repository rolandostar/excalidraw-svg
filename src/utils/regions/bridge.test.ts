import { describe, expect, it } from 'vitest';
import { bridgeHoles } from './bridge';
import { signedArea } from './primitives';
import type { Point, Ring } from './primitives';

const square = (x: number, y: number, size: number): Ring => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const reversed = (ring: Ring): Ring => [...ring].reverse();

/** Winding of the hole as it appears in the bridged result. */
const holeWindingIn = (result: Ring, hole: Ring): number => {
  const first = result.findIndex(p => p[0] === hole[0][0] && p[1] === hole[0][1]);
  const slice = result.slice(first, first + hole.length) as Point[];
  return Math.sign(signedArea(slice));
};

const OUTER = square(0, 0, 100);

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
