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
import { Resvg } from '@resvg/resvg-js';

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

function parseNumberList(value: string): number[] {
  return value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(n => Number.isFinite(n));
}

/** Reads the user-space window of an SVG document. */
export function readViewBox(svg: string): Box | null {
  const tag = svg.match(SVG_TAG)?.[0];
  if (!tag) return null;

  const vb = tag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (vb) {
    const parts = parseNumberList(vb[1]);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }

  const w = tag.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = tag.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (w && h) {
    const width = parseFloat(w[1]);
    const height = parseFloat(h[1]);
    if (width > 0 && height > 0) return { x: 0, y: 0, width, height };
  }

  return null;
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

