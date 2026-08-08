import { describe, expect, it } from 'vitest';
import { readViewBoxFromMarkup } from './viewBox';

const FALLBACK = { width: 48, height: 48 };
const read = (svg: string) => readViewBoxFromMarkup(svg, FALLBACK);

describe('readViewBoxFromMarkup', () => {
  it('reads a viewBox', () => {
    expect(read('<svg viewBox="0 0 24 24"/>')).toMatchObject({ width: 24, height: 24, source: 'viewBox' });
  });

  it('keeps a non-zero origin', () => {
    expect(read('<svg viewBox="-5 10 24 24"/>')).toMatchObject({ x: -5, y: 10 });
  });

  it('accepts commas as separators', () => {
    expect(read('<svg viewBox="0,0,24,24"/>')).toMatchObject({ width: 24, source: 'viewBox' });
  });

  it('falls through to width and height when the viewBox is unusable', () => {
    expect(read('<svg viewBox="0 0 0 0" width="32" height="16"/>')).toMatchObject({
      width: 32,
      height: 16,
      source: 'width/height',
    });
  });

  it('keeps the leading number of a dimension with units', () => {
    expect(read('<svg width="100mm" height="50mm"/>')).toMatchObject({ width: 100, height: 50 });
  });

  it('uses the fallback when nothing is usable', () => {
    expect(read('<svg/>')).toMatchObject({ ...FALLBACK, source: 'fallback' });
  });

  // Regression: the old regex matched `width=` anywhere in the file, so a
  // `stroke-width` on a child could be read as the document size.
  it('ignores attributes on child elements', () => {
    expect(read('<svg viewBox="0 0 24 24"><rect width="999" stroke-width="4"/></svg>')).toMatchObject({
      width: 24,
    });
  });
});
