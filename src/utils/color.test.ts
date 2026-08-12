import { describe, expect, it } from 'vitest';
import { averageHexColors, hexChannels, hexDigits, parseHexColor, relativeLuminance } from './color';

describe('hexDigits', () => {
  it.each([
    ['#abc', 'aabbcc'],
    ['#AABBCC', 'aabbcc'],
    ['  #4285F4 ', '4285f4'],
    ['#fff', 'ffffff'],
  ])('expands and lowercases %s', (input, expected) => {
    expect(hexDigits(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'transparent', 'rgb(1,2,3)', '#ff', '#1234567'])(
    'rejects %s',
    input => expect(hexDigits(input)).toBeNull()
  );
});

describe('hexChannels', () => {
  it('splits shorthand the same way as longhand', () => {
    expect(hexChannels('#abc')).toEqual(hexChannels('#aabbcc'));
    expect(hexChannels('#aabbcc')).toEqual([170, 187, 204]);
  });
});

describe('relativeLuminance', () => {
  it('bounds at black and white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 10);
  });

  // Green dominates the sRGB coefficients; a mask flooded with pure green
  // reveals, one flooded with pure blue does not.
  it('weights green far above blue', () => {
    expect(relativeLuminance(0, 255, 0)).toBeGreaterThan(relativeLuminance(0, 0, 255));
  });
});

describe('parseHexColor', () => {
  it.each([
    ['#abc', '#aabbcc'],
    ['#4285F4', '#4285f4'],
    ['rgb(66, 133, 244)', '#4285f4'],
    ['RGB(0,0,0)', '#000000'],
  ])('canonicalises %s to %s', (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each([null, 'transparent', 'rebeccapurple'])('rejects %s', input => {
    expect(parseHexColor(input)).toBeNull();
  });
});

describe('averageHexColors', () => {
  it('averages channelwise', () => {
    expect(averageHexColors(['#000000', '#ffffff'])).toBe('#808080');
  });

  it('ignores entries that do not parse', () => {
    expect(averageHexColors(['#000000', 'transparent', '#ffffff'])).toBe('#808080');
  });

  // Not '#4285F4': every colour reaching an option or a swatch is compared
  // with ===, so one casing has to win everywhere.
  it('falls back to the lowercase accent when nothing parses', () => {
    expect(averageHexColors([])).toBe('#4285f4');
    expect(averageHexColors(['none', 'transparent'])).toBe('#4285f4');
  });
});
