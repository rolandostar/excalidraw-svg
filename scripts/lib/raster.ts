/**
 * Deterministic SVG rasterisation + comparison primitives for the fidelity
 * harness.
 *
 * Everything here works on *pixels*, deliberately. `Resvg.getBBox()` returns a
 * geometry bounding box that includes invisible stroke extents (an Excalidraw
 * export carries `strokeColor: "transparent"` paths that inflate it by half a
 * stroke width on every side), so it cannot be used to frame two documents
 * comparably. Scanning the alpha channel of an actual render gives the true
 * ink box for both sides under identical rules.
 */
import { PNG } from 'pngjs';
import { Resvg } from '@resvg/resvg-js';
import { readViewBoxFromMarkup } from '../../src/utils/svg/viewBox';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Raster {
  data: Uint8Array; // RGBA
  width: number;
  height: number;
}

const SVG_TAG = /<svg\b[^>]*>/i;

/**
 * Reads the user-space window of an SVG document, or null if it declares
 * nothing this harness should trust.
 *
 * Delegates to the converter's own reader. The harness exists to measure
 * what the app produces, so parsing the input differently from the app is
 * the one divergence it cannot detect in itself - and there was one: this
 * used to accept `width="100"` but not `width="100mm"`.
 */
export function readViewBox(svg: string): Box | null {
  const box = readViewBoxFromMarkup(svg, { width: 0, height: 0 });
  return box.source === 'fallback' ? null : box;
}

/**
 * Rewrites the root `<svg>` attributes so the document renders into a known,
 * unletterboxed frame. Any `preserveAspectRatio` the author supplied is
 * replaced, otherwise `none` would silently distort one side of a comparison.
 */
export function setViewBox(svg: string, box: Box): string {
  const tag = svg.match(SVG_TAG)?.[0];
  if (!tag) return svg;

  let next = tag
    .replace(/\s+viewBox\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+width\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+height\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+preserveAspectRatio\s*=\s*["'][^"']*["']/gi, '');

  const attrs =
    ` viewBox="${box.x} ${box.y} ${box.width} ${box.height}"` +
    ` width="${box.width}" height="${box.height}"` +
    ` preserveAspectRatio="xMidYMid meet"`;

  next = next.replace(/\s*\/?>$/, m => `${attrs}${m.trimStart().startsWith('/') ? '/>' : '>'}`);
  return svg.replace(SVG_TAG, next);
}

/** Rasterises at `size` x (size * aspect) with the given background. */
export function rasterise(svg: string, size: number, background?: string): Raster {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    ...(background ? { background } : {}),
  });
  const image = resvg.render();
  return {
    data: new Uint8Array(image.pixels),
    width: image.width,
    height: image.height,
  };
}

/**
 * True ink box in *user units*, derived from the alpha channel of a render.
 * Returns null for a document that draws nothing.
 */
export function inkBox(svg: string, sampleWidth = 512, alphaThreshold = 8): Box | null {
  const viewBox = readViewBox(svg);
  if (!viewBox) return null;

  const framed = setViewBox(svg, viewBox);
  const { data, width, height } = rasterise(framed, sampleWidth);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;

  const sx = viewBox.width / width;
  const sy = viewBox.height / height;

  return {
    x: viewBox.x + minX * sx,
    y: viewBox.y + minY * sy,
    width: (maxX - minX + 1) * sx,
    height: (maxY - minY + 1) * sy,
  };
}

/** Horizontal strip: source | excalidraw | diff, separated by grey gutters. */
export function composeTriptych(panels: Raster[], gutter = 8): Buffer {
  const height = Math.max(...panels.map(p => p.height));
  const width = panels.reduce((sum, p) => sum + p.width, 0) + gutter * (panels.length - 1);
  const out = new PNG({ width, height });

  out.data.fill(0xff);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 0xff;

  let offsetX = 0;
  for (const panel of panels) {
    for (let y = 0; y < panel.height; y++) {
      for (let x = 0; x < panel.width; x++) {
        const src = (y * panel.width + x) * 4;
        const dst = (y * width + (x + offsetX)) * 4;
        out.data[dst] = panel.data[src];
        out.data[dst + 1] = panel.data[src + 1];
        out.data[dst + 2] = panel.data[src + 2];
        out.data[dst + 3] = 0xff;
      }
    }
    offsetX += panel.width;
    if (offsetX < width) {
      for (let y = 0; y < height; y++) {
        for (let x = offsetX; x < Math.min(offsetX + gutter, width); x++) {
          const dst = (y * width + x) * 4;
          out.data[dst] = 0xda;
          out.data[dst + 1] = 0xdc;
          out.data[dst + 2] = 0xe0;
          out.data[dst + 3] = 0xff;
        }
      }
      offsetX += gutter;
    }
  }

  return PNG.sync.write(out);
}
