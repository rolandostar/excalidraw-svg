// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getShapeStyle, readViewBoxFromMarkup, refId } from './style';

const parse = (body: string): Document =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
    'image/svg+xml'
  );

const fillOf = (body: string): string => {
  const doc = parse(body);
  const shape = doc.querySelector('rect')!;
  return getShapeStyle(shape, {}, doc).fill;
};

describe('refId', () => {
  // The `)` and `\s` in the character class are the whole point: a
  // quotes-only class captures `grad)`, which matches no element.
  it.each([
    ['url(#grad)', 'grad'],
    ["url('#grad')", 'grad'],
    ['url("#grad")', 'grad'],
    ['url( #grad )', 'grad'],
    ['#grad', 'grad'],
  ])('reads %s as %s', (input, expected) => {
    expect(refId(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'none', 'url(other.svg)'])('rejects %s', input => {
    expect(refId(input)).toBeNull();
  });
});

describe('gradient approximation', () => {
  const GRADIENT = `
    <defs>
      <linearGradient id="grad">
        <stop offset="0" stop-color="#ff0000"/>
        <stop offset="0.5" stop-color="#00ff00"/>
        <stop offset="1" stop-color="#0000ff"/>
      </linearGradient>
    </defs>`;

  it('resolves an unquoted url(#id) to the middle stop', () => {
    expect(fillOf(`${GRADIENT}<rect fill="url(#grad)" width="4" height="4"/>`)).toBe('#00ff00');
  });

  it('resolves a quoted url(#id) to the middle stop', () => {
    expect(fillOf(`${GRADIENT}<rect fill="url('#grad')" width="4" height="4"/>`)).toBe('#00ff00');
  });

  it('reads stop-color out of a stop style attribute', () => {
    const styled = `
      <defs>
        <linearGradient id="grad">
          <stop offset="0" style="stop-color:#ff0000"/>
          <stop offset="1" style="stop-color:#0000ff"/>
        </linearGradient>
      </defs>`;
    expect(fillOf(`${styled}<rect fill="url(#grad)" width="4" height="4"/>`)).toBe('#0000ff');
  });

  it('leaves the url() intact when the target is missing', () => {
    expect(fillOf('<rect fill="url(#absent)" width="4" height="4"/>')).toBe('url(#absent)');
  });
});

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
