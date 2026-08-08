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
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { Box, Raster, inkBox, rasterise, setViewBox } from './raster';

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
export function elementBounds(element: any): Box | null {
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
  const scale = Math.min(target.width / sourceViewBox.width, target.height / sourceViewBox.height);
  const offsetX = target.x + (target.width - sourceViewBox.width * scale) / 2 - sourceViewBox.x * scale;
  const offsetY = target.y + (target.height - sourceViewBox.height * scale) / 2 - sourceViewBox.y * scale;

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

export { inkBox };
