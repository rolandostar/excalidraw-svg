import { describe, expect, it } from 'vitest';
import {
  comparePlacement,
  expectedBounds,
  sceneWindowToSourceWindow,
  sourceToSceneTransform,
} from './raster';

const TARGET = { x: 0, y: 0, width: 48, height: 48 };
const SQUARE = { x: 0, y: 0, width: 24, height: 24 };
/** Wider than tall: a uniform fit has to letterbox it vertically. */
const WIDE = { x: 0, y: 0, width: 48, height: 24 };

describe('sourceToSceneTransform', () => {
  it('scales a square viewBox to fill the target', () => {
    expect(sourceToSceneTransform(SQUARE, TARGET)).toMatchObject({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('fits uniformly and centres the leftover axis', () => {
    const t = sourceToSceneTransform(WIDE, TARGET);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(12);
  });

  it('cancels a non-zero viewBox origin', () => {
    expect(sourceToSceneTransform({ x: 10, y: 10, width: 24, height: 24 }, TARGET).offsetX).toBe(-20);
  });
});

// This pair is the framing contract. Getting it wrong hides translation error
// completely, which is how every real number once looked ten times better.
describe('sceneWindowToSourceWindow', () => {
  it('is the inverse of sourceToSceneTransform', () => {
    const source = { x: 3, y: -4, width: 17, height: 9 };
    const { scale, offsetX, offsetY } = sourceToSceneTransform(WIDE, TARGET);
    const scene = {
      x: source.x * scale + offsetX,
      y: source.y * scale + offsetY,
      width: source.width * scale,
      height: source.height * scale,
    };

    const back = sceneWindowToSourceWindow(scene, WIDE, TARGET);
    expect(back.x).toBeCloseTo(source.x);
    expect(back.y).toBeCloseTo(source.y);
    expect(back.width).toBeCloseTo(source.width);
    expect(back.height).toBeCloseTo(source.height);
  });
});

describe('expectedBounds', () => {
  it('maps source ink through the same fit the converter applies', () => {
    expect(expectedBounds({ x: 6, y: 6, width: 12, height: 12 }, SQUARE, TARGET)).toEqual({
      x: 12,
      y: 12,
      width: 24,
      height: 24,
    });
  });
});

describe('comparePlacement', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it('reports zero when the boxes agree', () => {
    expect(comparePlacement(box, { ...box })?.maxErrorPx).toBe(0);
  });

  it('reports the largest single error, not the total', () => {
    const shifted = { x: 0.5, y: 0, width: 12, height: 10 };
    expect(comparePlacement(box, shifted)?.maxErrorPx).toBe(2);
  });

  it('returns null when there is nothing to compare against', () => {
    expect(comparePlacement(box, null)).toBeNull();
  });
});
