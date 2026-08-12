// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { localBoundingBox } from './visibility';
import { shapeBoundsPoints, shapeToRings } from './geometry';

const parse = (body: string): Element => {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
    'image/svg+xml'
  );
  return doc.documentElement;
};

const boxOf = (body: string) => localBoundingBox(parse(body), 0.05);

const SQUARE = '<rect x="2" y="9" width="4" height="6"/>';
const LONG_LINE = '<line x1="2" y1="12" x2="22" y2="12"/>';

/**
 * A `<line>` encloses no area but still has a bounding box, and the two facts
 * used to be answered by one function. The box came out four units wide
 * instead of twenty, so every `objectBoundingBox` fraction measured against it
 * was wrong and a clip landed in the wrong place.
 */
describe('localBoundingBox', () => {
  it('measures a plain rect', () => {
    expect(boxOf(SQUARE)).toEqual({ x: 2, y: 9, width: 4, height: 6 });
  });

  it('includes a line that reaches further than anything else', () => {
    expect(boxOf(SQUARE + LONG_LINE)).toMatchObject({ x: 2, width: 20 });
  });

  it('gives a lone diagonal line a box', () => {
    expect(boxOf('<line x1="0" y1="0" x2="10" y2="4"/>')).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 4,
    });
  });

  // Degenerate in one axis, so the unit matrix would be singular and the spec
  // says the reference simply does not apply.
  it('returns null for a line with no thickness in either axis', () => {
    expect(boxOf('<line x1="0" y1="5" x2="10" y2="5"/>')).toBeNull();
  });

  it('returns null when there is no geometry at all', () => {
    expect(boxOf('')).toBeNull();
  });
});

describe('shapeBoundsPoints vs shapeToRings', () => {
  const line = parse(LONG_LINE).querySelector('line')!;

  // The split is the whole fix. A line in a clipPath must clip nothing away,
  // so it must have no area, and it must still count towards a bounding box.
  it('gives a line two endpoints for a bounding box', () => {
    expect(shapeBoundsPoints(line, 0.05)).toEqual([
      [
        [2, 12],
        [22, 12],
      ],
    ]);
  });

  it('gives a line no area', () => {
    expect(shapeToRings(line, 0.05)).toEqual([]);
  });

  it('agrees with shapeToRings for every other tag', () => {
    for (const body of ['<rect x="1" y="2" width="3" height="4"/>', '<circle cx="5" cy="5" r="2"/>']) {
      const el = parse(body).firstElementChild!;
      expect(shapeBoundsPoints(el, 0.05)).toEqual(shapeToRings(el, 0.05));
    }
  });
});
