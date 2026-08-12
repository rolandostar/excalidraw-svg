import { PNG } from 'pngjs';
import { Resvg } from '@resvg/resvg-js';
import pixelmatch from 'pixelmatch';
import { readViewBoxFromMarkup } from '../../src/utils/svg/style';

/**
 * Deterministic rasterisation and pixel comparison for the fidelity harness.
 *
 * Everything here works on *pixels*, deliberately. `Resvg.getBBox()` returns
 * a geometry bounding box that includes invisible stroke extents, so it
 * cannot be used to frame two documents comparably. Scanning the alpha
 * channel of an actual render gives the true ink box for both sides under
 * identical rules.
 *
 *   raster    render, reframe, ink box, triptych
 *   compare   pixel diff, and the element-level shape and placement scores
 */

// ---------------------------------------------------------------------------
// Rasterising
// ---------------------------------------------------------------------------

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
function setViewBox(svg: string, box: Box): string {
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
function rasterise(svg: string, size: number, background?: string): Raster {
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

/**
 * Objective fidelity metrics for the SVG -> Excalidraw conversion.
 *
 * Two deliberately orthogonal measurements:
 *
 *  - **shape**    pixel diff of the source SVG against the Excalidraw scene,
 *                 each framed on its own ink box. Immune to placement, so it
 *                 answers "is the drawing right".
 *  - **placement** numeric comparison of where the emitted geometry landed
 *                 against where the source ink box says it should have landed.
 *                 Answers "is the drawing in the right place, at the right
 *                 size".
 *
 * Splitting them matters: a shape-only metric hides a systematic offset, and a
 * bbox-only metric hides a missing hole. Neither alone is a gate.
 */

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------

export interface ShapeReport {
  /** Mismatched pixels / union ink pixels. 0 is identical. */
  score: number;
  mismatchedPixels: number;
  /** Pixels inked by either side; the denominator for `score`. */
  unionInkPixels: number;
  size: number;
  source: Raster;
  scene: Raster;
  diff: Raster;
}

export interface PlacementReport {
  /** Largest absolute edge/size error, in output pixels. */
  maxErrorPx: number;
  expected: Box;
  actual: Box;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

const WHITE_CUTOFF = 250;

function isInked(data: Uint8Array, i: number): boolean {
  return data[i] < WHITE_CUTOFF || data[i + 1] < WHITE_CUTOFF || data[i + 2] < WHITE_CUTOFF;
}

/**
 * The source half of a comparison, split out so it can be cached.
 *
 * It is a function of the input file and the framing constants only, which
 * makes it identical on every run - see `sourceCache.ts`.
 */
export function rasteriseSource(sourceSvg: string, sourceWindow: Box, size: number): Raster {
  return rasterise(setViewBox(sourceSvg, sourceWindow), size, 'white');
}

/**
 * Diffs a rendered source panel against a scene, inside explicitly supplied
 * user-space windows.
 *
 * The two windows are known to correspond exactly, which matters: framing each
 * side on its own ink box sounds neutral but is not, because Excalidraw
 * hardcodes `stroke-linecap: round`, so a stroked icon's ink box is half a
 * stroke wider than the source's on every open end. Fitting that larger box to
 * the same canvas shrinks the whole drawing and lights up every edge in the
 * diff, burying the local differences that actually matter.
 */
export function compareRasterInFrame(
  source: Raster,
  sceneSvg: string,
  sceneWindow: Box,
  size: number
): ShapeReport | null {
  const scene = rasterise(setViewBox(sceneSvg, sceneWindow), size, 'white');
  return diffRasters(source, scene, size);
}

function diffRasters(source: Raster | null, scene: Raster | null, size: number): ShapeReport | null {
  if (!source || !scene) return null;

  const diff = new PNG({ width: size, height: size });
  const mismatchedPixels = pixelmatch(source.data, scene.data, diff.data, size, size, {
    threshold: 0.1,
    includeAA: false,
  });

  let unionInkPixels = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    if (isInked(source.data, i) || isInked(scene.data, i)) unionInkPixels++;
  }

  return {
    score: unionInkPixels > 0 ? mismatchedPixels / unionInkPixels : mismatchedPixels > 0 ? 1 : 0,
    mismatchedPixels,
    unionInkPixels,
    size,
    source,
    scene,
    diff: { data: new Uint8Array(diff.data), width: size, height: size },
  };
}

/**
 * Axis-aligned bounds of the *ink* an element lays down.
 *
 * Stroke extent is included, because the reference this is compared against is
 * a rasterised ink box, which necessarily includes it. Comparing a bare
 * geometry box against a stroked ink box reports a phantom error of half a
 * stroke width on every side.
 */
function elementBounds(element: any): Box | null {
  if (element.isDeleted) return null;

  const hasStroke = !!element.strokeColor && element.strokeColor !== 'transparent';
  const hasFill = !!element.backgroundColor && element.backgroundColor !== 'transparent';
  if (!hasStroke && !hasFill && element.type !== 'image') return null;

  const grow = hasStroke ? (element.strokeWidth || 1) / 2 : 0;

  let box: Box;
  if (element.type === 'line' && Array.isArray(element.points) && element.points.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of element.points) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    box = { x: element.x + minX, y: element.y + minY, width: maxX - minX, height: maxY - minY };
  } else {
    box = { x: element.x, y: element.y, width: element.width, height: element.height };
  }

  return {
    x: box.x - grow,
    y: box.y - grow,
    width: box.width + grow * 2,
    height: box.height + grow * 2,
  };
}

export function unionBounds(elements: any[]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    const box = elementBounds(element);
    if (!box) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The uniform fit `parseSvgToExcalidrawElements` applies: `scene = source *
 * scale + offset`. Exposed so the harness can map a scene-space comparison
 * window back into source user units.
 */
export function sourceToSceneTransform(
  sourceViewBox: Box,
  target: { x: number; y: number; width: number; height: number }
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(target.width / sourceViewBox.width, target.height / sourceViewBox.height);
  return {
    scale,
    offsetX: target.x + (target.width - sourceViewBox.width * scale) / 2 - sourceViewBox.x * scale,
    offsetY: target.y + (target.height - sourceViewBox.height * scale) / 2 - sourceViewBox.y * scale,
  };
}

/** Inverse of `sourceToSceneTransform`, mapping a scene window into source units. */
export function sceneWindowToSourceWindow(
  sceneWindow: Box,
  sourceViewBox: Box,
  target: { x: number; y: number; width: number; height: number }
): Box {
  const { scale, offsetX, offsetY } = sourceToSceneTransform(sourceViewBox, target);
  return {
    x: (sceneWindow.x - offsetX) / scale,
    y: (sceneWindow.y - offsetY) / scale,
    width: sceneWindow.width / scale,
    height: sceneWindow.height / scale,
  };
}

/**
 * Where the source ink *should* land, using the exact mapping
 * `parseSvgToExcalidrawElements` applies (uniform fit + centring).
 */
export function expectedBounds(
  sourceInk: Box,
  sourceViewBox: Box,
  target: { x: number; y: number; width: number; height: number }
): Box {
  const { scale, offsetX, offsetY } = sourceToSceneTransform(sourceViewBox, target);

  return {
    x: offsetX + sourceInk.x * scale,
    y: offsetY + sourceInk.y * scale,
    width: sourceInk.width * scale,
    height: sourceInk.height * scale,
  };
}

export function comparePlacement(expected: Box, actual: Box | null): PlacementReport | null {
  if (!actual) return null;
  const dx = actual.x - expected.x;
  const dy = actual.y - expected.y;
  const dWidth = actual.width - expected.width;
  const dHeight = actual.height - expected.height;
  return {
    maxErrorPx: Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dWidth), Math.abs(dHeight)),
    expected,
    actual,
    dx,
    dy,
    dWidth,
    dHeight,
  };
}
