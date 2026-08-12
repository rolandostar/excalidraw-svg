import type { ExcalidrawElement } from '../../types/excalidraw';
import { DRAWABLE_SHAPES, toleranceFor } from '../svg/geometry';
import { parseCssStylesheet, readViewBox } from '../svg/style';
import {
  type ConvertContext,
  RawShapeSink,
  convertShapeElement,
  dedupeRawShapes,
  dropBackgroundPlate,
} from './shapes';
import { rawShapesToElements } from './emit';

/**
 * The converter's entry point, and the tally of what it could not draw.
 *
 *   diagnostics   why a shape was dropped, and the labels the UI shows
 *   parseSvg      document -> fitted, clipped, simplified elements
 */

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Why source shapes produced no output, tallied per reason.
 *
 * Its own module because it is the one part of the conversion pipeline the UI
 * imports directly - `ConversionResult.tsx` renders `DROP_REASON_LABELS` - and
 * dragging the whole converter into a React component's dependency graph for a
 * lookup table is how a 700 kB chunk happens.
 */

/**
 * Why a shape in the source never became an element.
 *
 * The converter used to drop shapes silently, which made every failure look
 * identical from the outside: an empty canvas, or the flat message "No
 * drawable geometry found in that file." Attributing each drop is the
 * difference between a user filing a useful bug and giving up.
 */
export type DropReason =
  | 'no-fill-no-stroke'
  | 'empty-geometry'
  | 'clipped-away'
  | 'degenerate'
  | 'parse-error'
  | 'in-defs';

interface ShapeDrop {
  reason: DropReason;
  /** Tag name of the source element, e.g. `path`. */
  tag: string;
  count: number;
  detail: string;
}

export interface ConversionDiagnostics {
  drops: ShapeDrop[];
  /** Total source shapes that produced no output. */
  skippedTotal: number;
}

export const DROP_REASON_LABELS: Record<DropReason, string> = {
  'no-fill-no-stroke': 'resolved to no fill and no stroke',
  'empty-geometry': 'had no geometry to draw',
  'clipped-away': 'was clipped or masked away entirely',
  degenerate: 'collapsed to nothing at the output size',
  'parse-error': 'could not be parsed',
  'in-defs': 'is a definition, only drawn where referenced',
};

export function emptyDiagnostics(): ConversionDiagnostics {
  return { drops: [], skippedTotal: 0 };
}

/**
 * Accumulates drops into an optional `ConversionDiagnostics`.
 *
 * The tally is keyed through a `Map`. The previous closure did a linear
 * `drops.find` per drop, which is quadratic in the number of distinct drops -
 * fine for the three or four an icon produces, not fine for a pathological
 * upload where every one of a thousand paths fails with its own parser
 * message.
 *
 * A missing sink is not an error: three of the four callers do not report to a
 * user and pass nothing.
 */
class DiagnosticsSink {
  private readonly index = new Map<string, ShapeDrop>();

  constructor(private readonly target?: ConversionDiagnostics) {
    for (const drop of target?.drops ?? []) {
      this.index.set(`${drop.reason}\u0000${drop.tag}\u0000${drop.detail}`, drop);
    }
  }

  note(reason: DropReason, tag: string, detail: string = DROP_REASON_LABELS[reason]): void {
    if (!this.target) return;
    this.target.skippedTotal += 1;

    const key = `${reason}\u0000${tag}\u0000${detail}`;
    const existing = this.index.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    const drop: ShapeDrop = { reason, tag, count: 1, detail };
    this.index.set(key, drop);
    this.target.drops.push(drop);
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * The conversion pipeline, end to end.
 *
 * Deliberately thin: read the viewBox, work out the fit, run every drawable
 * element through `convertShapeElement`, dedupe, drop the background plate,
 * emit. Each of those steps is a module of its own, so this file is the place
 * to read the *order* things happen in and nothing else.
 */

/**
 * A hole smaller than this many square output pixels is dropped rather than
 * bridged. Well below one pixel, so nothing visible is ever discarded.
 */
const MIN_VISIBLE_HOLE_AREA_PX = 0.02;

/**
 * Artboard assumed when a file declares no usable size. 24x24 is what the
 * curated icon corpus is authored against, and treating an unsized file as a
 * 24-unit artboard at least puts it in the right order of magnitude.
 */
const FALLBACK_ARTBOARD = { width: 24, height: 24 };

/** The scene-space box the artwork is fitted into. */
export interface TargetBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParseSvgOptions {
  groupId: string;
  roughness: number;
  /**
   * Optional out-parameter, filled with a per-reason tally of source shapes
   * that produced no output. Only the upload path, which reports to a user,
   * passes one.
   */
  diagnostics?: ConversionDiagnostics;
}

/** Converts SVG paths, curves, polygons, and shapes into Excalidraw vector elements */
export function parseSvgToExcalidrawElements(
  rawSvg: string,
  target: TargetBox,
  opts: ParseSvgOptions
): ExcalidrawElement[] {
  const drops = new DiagnosticsSink(opts.diagnostics);

  try {
    const doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return [];

    // --- fit: viewBox -> target box, uniform and centred -------------------
    const viewBox = readViewBox(svgEl, FALLBACK_ARTBOARD);
    const scale = Math.min(target.width / viewBox.width, target.height / viewBox.height);
    const offsetX = target.x + (target.width - viewBox.width * scale) / 2 - viewBox.x * scale;
    const offsetY = target.y + (target.height - viewBox.height * scale) / 2 - viewBox.y * scale;

    const tolerance = toleranceFor(scale);

    const ctx: ConvertContext = {
      doc,
      styleMap: parseCssStylesheet(doc),
      tolerance,
      // Smallest hole worth keeping, in user units squared - the pixel floor
      // converted into the source's own coordinates.
      sink: new RawShapeSink(MIN_VISIBLE_HOLE_AREA_PX / (scale * scale), tolerance),
    };

    // --- convert: one pass over the document, in paint order ---------------
    doc.querySelectorAll(DRAWABLE_SHAPES).forEach(el => {
      try {
        const reason = convertShapeElement(el, ctx);
        if (reason) drops.note(reason, el.tagName.toLowerCase());
      } catch (err) {
        console.warn(`Shape conversion warning (<${el.tagName.toLowerCase()}>):`, err);
        drops.note(
          'parse-error',
          el.tagName.toLowerCase(),
          err instanceof Error ? err.message : String(err)
        );
      }
    });

    const unique = dedupeRawShapes(ctx.sink.shapes);
    if (unique.length === 0) return [];

    // NOTE: there is deliberately no "open path with a fill becomes a stroke"
    // fixup here any more. Every stroke is now emitted as the area it covers
    // (see `RawShapeSink.pushStroke`), so no shape reaching this point is an
    // open path.
    const drawable = dropBackgroundPlate(unique, viewBox);

    return rawShapesToElements(drawable, {
      scale,
      offsetX,
      offsetY,
      groupId: opts.groupId,
      roughness: opts.roughness,
    });
  } catch (err) {
    console.error('Vector parsing error:', err);
    return [];
  }
}
