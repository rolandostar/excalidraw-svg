// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RawShapeSink, convertShapeElement, type ConvertContext } from './shapeConverters';
import { boundsOf } from '../svg/geometry';
import type { RawShape } from './rawShape';

const TOLERANCE = 0.05;

/** Converts every drawable shape in the markup and returns what it produced. */
function convert(body: string): RawShape[] {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
    'image/svg+xml'
  );
  const sink = new RawShapeSink(0, TOLERANCE);
  const ctx: ConvertContext = { doc, styleMap: {}, tolerance: TOLERANCE, sink };

  doc.querySelectorAll('circle, ellipse, rect').forEach(el => convertShapeElement(el, ctx));
  return sink.shapes;
}

const LEFT_HALF = `<clipPath id="left" clipPathUnits="userSpaceOnUse">
  <rect x="0" y="0" width="7" height="24"/>
</clipPath>`;

const WIDE_OPEN = `<clipPath id="open" clipPathUnits="userSpaceOnUse">
  <rect x="0" y="0" width="24" height="24"/>
</clipPath>`;

/**
 * An Excalidraw ellipse is parametric - a box, not a point list - so a clip
 * region has nothing to intersect. A clipped `<circle>` used to render whole.
 */
describe('a clipped ellipse', () => {
  it('stays a real ellipse when nothing clips it', () => {
    const shapes = convert('<circle cx="7" cy="7" r="6" fill="#4285f4"/>');
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ type: 'ellipse', cx: 7, cy: 7, rx: 6, ry: 6 });
  });

  it('stays a real ellipse when the clip does not reach it', () => {
    const shapes = convert(
      `<defs>${WIDE_OPEN}</defs><circle cx="7" cy="7" r="6" fill="#4285f4" clip-path="url(#open)"/>`
    );
    expect(shapes.map(s => s.type)).toEqual(['ellipse']);
  });

  it('becomes a cropped outline when the clip cuts it', () => {
    const shapes = convert(
      `<defs>${LEFT_HALF}</defs><circle cx="7" cy="7" r="6" fill="#4285f4" clip-path="url(#left)"/>`
    );

    expect(shapes.map(s => s.type)).toEqual(['line']);
    const bounds = boundsOf((shapes[0] as { absPoints: [number, number][] }).absPoints);
    expect(bounds.minX).toBeCloseTo(1, 1);
    expect(bounds.maxX).toBeCloseTo(7, 1);
  });

  it('crops a rect that is really an ellipse, too', () => {
    const shapes = convert(
      `<defs>${LEFT_HALF}</defs>` +
        '<rect x="1" y="1" width="12" height="12" rx="6" ry="6" fill="#34a853" clip-path="url(#left)"/>'
    );
    expect(shapes.some(s => s.type === 'ellipse')).toBe(false);
    expect(shapes.some(s => s.type === 'line')).toBe(true);
  });

  it('keeps the fill and opacity through the crop', () => {
    const shapes = convert(
      `<defs>${LEFT_HALF}</defs>` +
        '<circle cx="7" cy="7" r="6" fill="#4285f4" opacity="0.5" clip-path="url(#left)"/>'
    );
    expect(shapes[0]).toMatchObject({ fill: '#4285f4', opacity: 50 });
  });

  it('draws nothing when the clip misses it entirely', () => {
    const shapes = convert(
      `<defs><clipPath id="far" clipPathUnits="userSpaceOnUse">
        <rect x="100" y="100" width="5" height="5"/>
      </clipPath></defs>` +
        '<circle cx="7" cy="7" r="6" fill="#4285f4" clip-path="url(#far)"/>'
    );
    expect(shapes).toEqual([]);
  });
});
