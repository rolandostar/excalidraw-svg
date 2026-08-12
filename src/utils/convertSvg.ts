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
import { parseSvgToExcalidrawElements } from './convert/parseSvg';
import { type ConversionDiagnostics, emptyDiagnostics } from './convert/diagnostics';
import { type ViewBox, readViewBox } from './svg/viewBox';
import { type SvgFeatureWarning, collectUnsupportedFeatures } from './svgSupport';
import { type FidelityIssue, auditSceneFidelity } from './sceneAudit';
import type { ExcalidrawElement } from '../types/excalidraw';

/** Beyond this the scene stops being pasteable at a sensible zoom. */
const MAX_DIMENSION = 1200;
/** Below this, Excalidraw's minimum stroke rendering starts to dominate. */
const MIN_DIMENSION = 24;

export interface SvgDimensions {
  width: number;
  height: number;
  /** Where the numbers came from, so the UI can say so honestly. */
  source: ViewBox['source'];
}

/**
 * Size assumed for a file that declares neither a usable viewBox nor usable
 * dimensions. Larger than the converter's 24 because an arbitrary upload is
 * far more likely to be a diagram than a 24-unit icon.
 */
const FALLBACK_SIZE = { width: 100, height: 100 };

/**
 * Carries the drop tally so the failure path can say *why*.
 *
 * Without it, every distinct cause - an unread root-`<svg>` fill, a mask that
 * resolved to nothing, an unparseable `d` - surfaced as the same sentence, and
 * the user's only recourse was to guess.
 */
export class SvgConversionError extends Error {
  constructor(message: string, readonly diagnostics: ConversionDiagnostics = emptyDiagnostics()) {
    super(message);
    this.name = 'SvgConversionError';
  }
}

/**
 * Intrinsic size of an SVG, preferring the viewBox.
 *
 * The reading itself lives in `svg/viewBox.ts`, shared with the converter and
 * the icon-set loader; only the "there must be an `<svg>`" precondition and
 * the 100x100 fallback are specific to the upload path.
 */
export function readSvgDimensions(doc: Document): SvgDimensions {
  const svg = doc.querySelector('svg');
  if (!svg) throw new SvgConversionError('No <svg> element found.');

  const { width, height, source } = readViewBox(svg, FALLBACK_SIZE);
  return { width, height, source };
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
  /** Source shapes that produced no output, and why. */
  diagnostics: ConversionDiagnostics;
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

  const diagnostics = emptyDiagnostics();
  const elements = parseSvgToExcalidrawElements(
    rawSvg,
    { x: 0, y: 0, width, height },
    { groupId: `svg_${Math.random().toString(36).slice(2, 10)}`, roughness, diagnostics }
  );

  const warnings = collectUnsupportedFeatures(rawSvg);

  // An empty result with no warnings means the converter found geometry it
  // silently could not handle - surfaced as an error rather than an empty
  // canvas, which the user would read as "the site is broken". The drop tally
  // rides along so the message can name a cause instead of shrugging.
  if (elements.length === 0) {
    throw new SvgConversionError(
      warnings.some(w => w.severity === 'unsupported')
        ? 'Nothing convertible in that file — everything in it is unsupported. See the details below.'
        : diagnostics.skippedTotal > 0
        ? `No drawable geometry found: all ${diagnostics.skippedTotal} shape${
            diagnostics.skippedTotal === 1 ? '' : 's'
          } in that file were skipped. See the breakdown below.`
        : 'No drawable geometry found in that file.',
      diagnostics
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
    diagnostics,
    counts: {
      total: elements.length,
      lines: elements.filter(e => e.type === 'line').length,
      ellipses: elements.filter(e => e.type === 'ellipse').length,
    },
    clipboardJson: JSON.stringify(payload),
    sceneJson: JSON.stringify(scene, null, 2),
  };
}
