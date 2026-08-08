import { describe, expect, it } from 'vitest';
import { applyMatrix, matrixScale, multiplyMatrix, parseTransformMatrix } from './matrix';

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
