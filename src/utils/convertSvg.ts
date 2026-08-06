/**
 * Conversion entry point for user-supplied SVGs.
 *
 * Distinct from `createExcalidrawItem`, which exists to lay out a *curated
 * 24x24 icon* inside an optional card with a label. An arbitrary uploaded file
 * has none of that context: no known artboard, no title, no reason to be
 * wrapped in chrome. So this path converts the geometry and nothing else.
 *
 * It also reports, rather than swallows, everything the converter cannot do.
 * For the icon set that silence is fine because 216 files have been checked
 * against a renderer; for a stranger's logo, "nothing happened" is
 * indistinguishable from "your wordmark was dropped".
 */
import { parseSvgToExcalidrawElements } from './excalidrawGenerator';
import { collectUnsupportedFeatures, type SvgFeatureWarning } from './svgSupport';
import { auditSceneFidelity, type FidelityIssue } from './sceneAudit';
import type { ExcalidrawElement } from '../types';

/** Beyond this the scene stops being pasteable at a sensible zoom. */
const MAX_DIMENSION = 1200;
/** Below this, Excalidraw's minimum stroke rendering starts to dominate. */
const MIN_DIMENSION = 24;

export interface SvgDimensions {
  width: number;
  height: number;
  /** Where the numbers came from, so the UI can say so honestly. */
  source: 'viewBox' | 'width/height' | 'fallback';
}

export class SvgConversionError extends Error {}

/**
 * Intrinsic size of an SVG, preferring the viewBox.
 *
 * `width`/`height` may carry units (`100mm`, `12em`) or percentages, none of
 * which mean anything without a containing block, so the viewBox is the only
 * dependable source of an aspect ratio.
 */
export function readSvgDimensions(doc: Document): SvgDimensions {
  const svg = doc.querySelector('svg');
  if (!svg) throw new SvgConversionError('No <svg> element found.');

  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3], source: 'viewBox' };
    }
  }

  const w = parseFloat(svg.getAttribute('width') || '');
  const h = parseFloat(svg.getAttribute('height') || '');
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h, source: 'width/height' };
  }

  return { width: 100, height: 100, source: 'fallback' };
}

/** Scales the intrinsic box into the pasteable range, preserving aspect ratio. */
export function fitToCanvas(dims: SvgDimensions): { width: number; height: number } {
  const longest = Math.max(dims.width, dims.height);
  const scale =
    longest > MAX_DIMENSION
      ? MAX_DIMENSION / longest
      : longest < MIN_DIMENSION
      ? MIN_DIMENSION / longest
      : 1;

  return {
    width: Math.round(dims.width * scale),
    height: Math.round(dims.height * scale),
  };
}

export interface ConversionResult {
  elements: ExcalidrawElement[];
  width: number;
  height: number;
  dimensions: SvgDimensions;
  /** Features the converter cannot represent exactly. */
  warnings: SvgFeatureWarning[];
  /** Elements Excalidraw will refuse to draw as intended. */
  auditIssues: FidelityIssue[];
  counts: { total: number; lines: number; ellipses: number };
  /** `excalidraw/clipboard` payload, ready for navigator.clipboard. */
  clipboardJson: string;
  /** `.excalidraw` scene file contents. */
  sceneJson: string;
}

export function convertSvg(rawSvg: string, roughness = 0): ConversionResult {
  const doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new SvgConversionError('That file is not well-formed XML.');
  }

  const dimensions = readSvgDimensions(doc);
  const { width, height } = fitToCanvas(dimensions);

  const elements = parseSvgToExcalidrawElements(
    rawSvg,
    0,
    0,
    width,
    height,
    `svg_${Math.random().toString(36).slice(2, 10)}`,
    roughness
  );

  const warnings = collectUnsupportedFeatures(rawSvg);

  // An empty result with no warnings means the converter found geometry it
  // silently could not handle - surfaced as an error rather than an empty
  // canvas, which the user would read as "the site is broken".
  if (elements.length === 0) {
    throw new SvgConversionError(
      warnings.some(w => w.severity === 'unsupported')
        ? 'Nothing convertible in that file — everything in it is unsupported. See the details below.'
        : 'No drawable geometry found in that file.'
    );
  }

  const payload = { type: 'excalidraw/clipboard', elements, files: {} };
  const scene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://github.com/rolandostar/excalidraw-svg',
    elements,
    appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
    files: {},
  };

  return {
    elements,
    width,
    height,
    dimensions,
    warnings,
    auditIssues: auditSceneFidelity(elements),
    counts: {
      total: elements.length,
      lines: elements.filter(e => e.type === 'line').length,
      ellipses: elements.filter(e => e.type === 'ellipse').length,
    },
    clipboardJson: JSON.stringify(payload),
    sceneJson: JSON.stringify(scene, null, 2),
  };
}
